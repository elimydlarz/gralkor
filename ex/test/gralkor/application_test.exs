defmodule Gralkor.ApplicationTest do
  use ExUnit.Case, async: false

  require Logger

  alias Gralkor.Application, as: App

  setup do
    original_env = System.get_env("GRALKOR_DATA_DIR")
    original_client = Application.get_env(:gralkor_ex, :client)

    on_exit(fn ->
      case original_env do
        nil -> System.delete_env("GRALKOR_DATA_DIR")
        v -> System.put_env("GRALKOR_DATA_DIR", v)
      end

      case original_client do
        nil -> Application.delete_env(:gralkor_ex, :client)
        v -> Application.put_env(:gralkor_ex, :client, v)
      end
    end)

    Application.delete_env(:gralkor_ex, :client)
    :ok
  end

  describe "ex-application > start/2 child specs > when GRALKOR_DATA_DIR is unset" do
    test "the supervisor includes no children" do
      System.delete_env("GRALKOR_DATA_DIR")

      assert [] = App.children()
    end
  end

  describe "ex-application > start/2 child specs > when GRALKOR_DATA_DIR is set and `:gralkor_ex, :client` is unset or Gralkor.Client.Native" do
    test "the supervisor includes Gralkor.Python, Gralkor.GraphitiPool, Gralkor.CaptureBuffer in order" do
      System.put_env("GRALKOR_DATA_DIR", System.tmp_dir!())

      children = App.children()

      assert length(children) == 3

      [first, second, third] = children

      assert first == Gralkor.Python
      assert {Gralkor.GraphitiPool, _} = second
      assert {Gralkor.CaptureBuffer, _} = third
    end

    test "the same set is returned when client is explicitly Gralkor.Client.Native" do
      System.put_env("GRALKOR_DATA_DIR", System.tmp_dir!())
      Application.put_env(:gralkor_ex, :client, Gralkor.Client.Native)

      assert [Gralkor.Python, {Gralkor.GraphitiPool, _}, {Gralkor.CaptureBuffer, _}] =
               App.children()
    end

    test "GraphitiPool is configured with the data_dir from Gralkor.Config" do
      data_dir = Path.join(System.tmp_dir!(), "ex_app_test_#{System.unique_integer([:positive])}")
      System.put_env("GRALKOR_DATA_DIR", data_dir)

      [_python, {Gralkor.GraphitiPool, opts}, _buffer] = App.children()

      assert Keyword.fetch!(opts, :data_dir) == Path.expand(data_dir)
    end

    test "CaptureBuffer is configured with a flush_callback function" do
      System.put_env("GRALKOR_DATA_DIR", System.tmp_dir!())

      [_python, _pool, {Gralkor.CaptureBuffer, opts}] = App.children()

      assert is_function(Keyword.fetch!(opts, :flush_callback), 2)
    end
  end

  describe "ex-application > start/2 child specs > when `:gralkor_ex, :client` is configured to Gralkor.Client.InMemory" do
    test "the supervisor includes no children regardless of GRALKOR_DATA_DIR" do
      System.put_env("GRALKOR_DATA_DIR", System.tmp_dir!())
      Application.put_env(:gralkor_ex, :client, Gralkor.Client.InMemory)

      assert [] = App.children()
    end
  end

  describe "ex-capture > flush > when the distilled episode body is empty" do
    @tag :capture_log
    test "no episode is added and nothing is logged" do
      add_episode_fn = fn _g, _b, _s -> flunk("add_episode should not be called") end

      cb =
        App.build_flush_callback(nil,
          distill_fn: fn _ -> {:ok, ""} end,
          add_episode_fn: add_episode_fn
        )

      logs =
        ExUnit.CaptureLog.capture_log([level: :debug], fn ->
          assert :ok = cb.("g", [])
        end)

      refute logs =~ "[gralkor] capture flushed"
      refute logs =~ "[gralkor] [test] capture flush body"
    end
  end

  describe "ex-capture > flush > when the episode is added" do
    @tag :capture_log
    test "logs the group, body size, and how long the add took" do
      add_episode_fn = fn _g, _b, _s -> :ok end

      cb =
        App.build_flush_callback(nil,
          distill_fn: fn _ -> {:ok, "behaviour summary"} end,
          add_episode_fn: add_episode_fn
        )

      turns = [[Gralkor.Message.new("user", "hi"), Gralkor.Message.new("assistant", "hello")]]

      logs =
        ExUnit.CaptureLog.capture_log([level: :info], fn ->
          assert :ok = cb.("g1", turns)
        end)

      assert logs =~ "[gralkor] capture flushed"
      assert logs =~ "group:g1"
      assert logs =~ ~r/bodyChars:\d+/
      assert logs =~ ~r/\d+ms/
    end
  end

  describe "ex-capture > flush > when test mode is enabled" do
    setup do
      Application.put_env(:gralkor_ex, :test, true)
      on_exit(fn -> Application.delete_env(:gralkor_ex, :test) end)
      :ok
    end

    @tag :capture_log
    test "also logs the distilled episode body" do
      add_episode_fn = fn _g, _b, _s -> :ok end

      cb =
        App.build_flush_callback(nil,
          distill_fn: fn _ -> {:ok, "behaviour summary"} end,
          add_episode_fn: add_episode_fn
        )

      turns = [[Gralkor.Message.new("user", "hi"), Gralkor.Message.new("assistant", "hello")]]

      logs =
        ExUnit.CaptureLog.capture_log(fn ->
          assert :ok = cb.("g1", turns)
        end)

      assert logs =~ "[gralkor] [test] capture flush body:"
      assert logs =~ "User: hi"
    end
  end

  describe "ex-capture > flush > when test mode is disabled" do
    @tag :capture_log
    test "does not log the distilled episode body" do
      cb =
        App.build_flush_callback(nil,
          distill_fn: fn _ -> {:ok, "behaviour summary"} end,
          add_episode_fn: fn _g, _b, _s -> :ok end
        )

      turns = [[Gralkor.Message.new("user", "hi")]]

      logs =
        ExUnit.CaptureLog.capture_log(fn ->
          assert :ok = cb.("g1", turns)
        end)

      refute logs =~ "[gralkor] [test]"
    end
  end
end
