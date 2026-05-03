defmodule Gralkor.CaptureBufferTest do
  use ExUnit.Case, async: false

  alias Gralkor.CaptureBuffer
  alias Gralkor.Message

  setup do
    test_pid = self()

    flush_callback = fn group_id, turns ->
      send(test_pid, {:flushed, group_id, turns})
      :ok
    end

    {:ok, pid} = start_supervised({CaptureBuffer, flush_callback: flush_callback, retries: []})
    %{pid: pid}
  end

  describe "ex-capture-buffer > append/3 when called for a new session_id" do
    test "an entry is created bound to the sanitized group_id and the turn" do
      msgs = [Message.new("user", "hi")]
      :ok = CaptureBuffer.append("session-1", "group-1", msgs)

      assert [^msgs] = CaptureBuffer.turns_for("session-1")
    end

    test "the group_id is stored in sanitized form (hyphens → underscores)" do
      :ok = CaptureBuffer.append("s", "with-hyphens", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert_receive {:flushed, "with_hyphens", _turns}
    end
  end

  describe "ex-capture-buffer > append/3 when called again for the same session_id" do
    test "the new turn is appended and prior turns remain buffered" do
      t1 = [Message.new("user", "first")]
      t2 = [Message.new("user", "second")]
      :ok = CaptureBuffer.append("s", "g", t1)
      :ok = CaptureBuffer.append("s", "g", t2)

      assert [^t1, ^t2] = CaptureBuffer.turns_for("s")
    end
  end

  describe "ex-capture-buffer > append/3 when called for multiple session_ids" do
    test "each session_id has an independent entry" do
      :ok = CaptureBuffer.append("a", "g", [Message.new("user", "a-msg")])
      :ok = CaptureBuffer.append("b", "g", [Message.new("user", "b-msg")])

      assert [[%Message{content: "a-msg"}]] = CaptureBuffer.turns_for("a")
      assert [[%Message{content: "b-msg"}]] = CaptureBuffer.turns_for("b")
    end
  end

  describe "ex-capture-buffer > append/3 when called for an existing session_id with a different group_id" do
    test "raises (sessions are not re-bindable across groups)" do
      :ok = CaptureBuffer.append("s", "g1", [Message.new("user", "x")])

      assert_raise ArgumentError, ~r/group/i, fn ->
        CaptureBuffer.append("s", "g2", [Message.new("user", "y")])
      end
    end
  end

  describe "ex-capture-buffer > turns_for/1" do
    test "when the session has never been appended to, returns []" do
      assert [] = CaptureBuffer.turns_for("nope")
    end

    test "when the session has been flushed, returns []" do
      :ok = CaptureBuffer.append("s", "g", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert [] = CaptureBuffer.turns_for("s")
    end
  end

  describe "ex-capture-buffer > flush/1 when called for a session_id with buffered turns" do
    test "the flush callback is scheduled with (group_id, [[Message]]) and the call returns without awaiting" do
      msgs = [Message.new("user", "hi")]
      :ok = CaptureBuffer.append("s", "g", msgs)

      :ok = CaptureBuffer.flush("s")

      assert_receive {:flushed, "g", [^msgs]}, 1_000
    end

    test "the entry is removed from the buffer" do
      :ok = CaptureBuffer.append("s", "g", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert [] = CaptureBuffer.turns_for("s")
    end
  end

  describe "ex-capture-buffer > flush/1 when called for a session_id with no entry" do
    test "returns without scheduling any flush" do
      :ok = CaptureBuffer.flush("never-existed")

      refute_receive {:flushed, _, _}, 100
    end
  end

  describe "ex-capture-buffer > flush_all/0" do
    test "when called with pending entries, every entry is flushed and awaited" do
      :ok = CaptureBuffer.append("s1", "g", [Message.new("user", "1")])
      :ok = CaptureBuffer.append("s2", "g", [Message.new("user", "2")])

      :ok = CaptureBuffer.flush_all()

      assert_receive {:flushed, "g", [[%Message{content: "1"}]]}, 1_000
      assert_receive {:flushed, "g", [[%Message{content: "2"}]]}, 1_000
    end

    test "when called with no entries, returns immediately" do
      assert :ok = CaptureBuffer.flush_all()
    end
  end

  describe "ex-capture-buffer > retry schedule" do
    setup do
      test_pid = self()

      attempts = :counters.new(1, [])

      flush_callback = fn _g, _t ->
        n = :counters.get(attempts, 1) + 1
        :counters.add(attempts, 1, 1)
        send(test_pid, {:attempt, n})

        case n do
          1 -> raise "internal: graph write blew up"
          2 -> raise "internal: still bad"
          _ -> :ok
        end
      end

      :ok = stop_supervised(CaptureBuffer)

      {:ok, _} =
        start_supervised({CaptureBuffer, flush_callback: flush_callback, retries: [10, 20, 30]})

      :ok
    end

    test "when the flush callback raises an internal error then retries with the configured backoff" do
      :ok = CaptureBuffer.append("s", "g", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert_receive {:attempt, 1}, 200
      assert_receive {:attempt, 2}, 200
      assert_receive {:attempt, 3}, 200
      refute_receive {:attempt, 4}, 100
    end
  end

  describe "ex-capture-buffer > retry schedule when 4xx is returned" do
    setup do
      test_pid = self()
      attempts = :counters.new(1, [])

      flush_callback = fn _g, _t ->
        :counters.add(attempts, 1, 1)
        send(test_pid, {:attempt, :counters.get(attempts, 1)})
        {:error, :capture_client_4xx}
      end

      :ok = stop_supervised(CaptureBuffer)

      {:ok, _} =
        start_supervised({CaptureBuffer, flush_callback: flush_callback, retries: [10, 20, 30]})

      :ok
    end

    test "does not retry — the call is contract-error and dropped" do
      :ok = CaptureBuffer.append("s", "g", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert_receive {:attempt, 1}, 200
      refute_receive {:attempt, 2}, 100
    end
  end

  describe "ex-capture-buffer > retry schedule when an upstream-LLM error is returned" do
    setup do
      test_pid = self()
      attempts = :counters.new(1, [])

      flush_callback = fn _g, _t ->
        :counters.add(attempts, 1, 1)
        send(test_pid, {:attempt, :counters.get(attempts, 1)})
        {:error, {:upstream_llm, :rate_limited}}
      end

      :ok = stop_supervised(CaptureBuffer)

      {:ok, _} =
        start_supervised({CaptureBuffer, flush_callback: flush_callback, retries: [10, 20, 30]})

      :ok
    end

    test "does not retry — would amplify load on the struggling upstream" do
      :ok = CaptureBuffer.append("s", "g", [Message.new("user", "x")])
      :ok = CaptureBuffer.flush("s")

      assert_receive {:attempt, 1}, 200
      refute_receive {:attempt, 2}, 100
    end
  end
end
