defmodule Gralkor.InterpretTest do
  use ExUnit.Case, async: true

  alias Gralkor.Interpret
  alias Gralkor.Message

  # ── ex-interpret ─────────────────────────────────────────────

  describe "ex-interpret > interpret_facts/3 calls the configured LLM with the prompt" do
    test "the prompt includes the labelled conversation messages and the formatted facts" do
      ref = make_ref()
      test_pid = self()

      interpret_fn = fn prompt ->
        send(test_pid, {ref, prompt})
        {:ok, []}
      end

      _ =
        Interpret.interpret_facts(
          [Message.new("user", "what about X?")],
          "- X is a thing (created 2020)",
          interpret_fn
        )

      assert_receive {^ref, prompt}
      assert prompt =~ "User: what about X?"
      assert prompt =~ "- X is a thing (created 2020)"
    end
  end

  describe "ex-interpret > interpret_facts/3 when the LLM returns relevant facts" do
    test "returns the list unchanged" do
      facts = [
        "X is a thing (created 2020) — relevant because the user asked about X",
        "Y was deprecated (invalid since 2022) — context for the timeline question"
      ]

      interpret_fn = fn _ -> {:ok, facts} end

      assert ^facts =
               Interpret.interpret_facts(
                 [Message.new("user", "tell me about X")],
                 "- X is a thing\n- Y was deprecated",
                 interpret_fn
               )
    end
  end

  describe "ex-interpret > interpret_facts/3 when the LLM returns an empty list" do
    test "returns []" do
      interpret_fn = fn _ -> {:ok, []} end

      assert [] =
               Interpret.interpret_facts(
                 [Message.new("user", "q")],
                 "- nothing relevant",
                 interpret_fn
               )
    end
  end

  describe "ex-interpret > interpret_facts/3 if the LLM response is malformed" do
    test "raises" do
      interpret_fn = fn _ -> {:ok, %{not: "a list"}} end

      assert_raise RuntimeError, ~r/malformed/, fn ->
        Interpret.interpret_facts(
          [Message.new("user", "q")],
          "- f",
          interpret_fn
        )
      end
    end

    test "raises when the call returns {:error, _}" do
      interpret_fn = fn _ -> {:error, :upstream} end

      assert_raise RuntimeError, ~r/interpret failed/, fn ->
        Interpret.interpret_facts(
          [Message.new("user", "q")],
          "- f",
          interpret_fn
        )
      end
    end
  end

  describe "ex-interpret > the structured-output schema" do
    test "interpret_schema/0 declares relevantFacts as a list of strings" do
      schema = Interpret.interpret_schema()

      assert Keyword.has_key?(schema, :relevantFacts)
      assert schema[:relevantFacts][:type] == {:list, :string}
      assert schema[:relevantFacts][:required] == true
    end

    test "the schema's doc instructs the LLM to copy facts verbatim and preserve timestamps" do
      doc = Interpret.interpret_schema()[:relevantFacts][:doc]

      assert doc =~ ~r/verbatim/i
      assert doc =~ ~r/timestamp/i
    end
  end

  # ── ex-interpret-context ─────────────────────────────────────

  describe "ex-interpret-context > build_interpretation_context/2" do
    test "labels each message by role: 'User', 'Assistant', 'Agent did' (for behaviour)" do
      ctx =
        Interpret.build_interpretation_context(
          [
            Message.new("user", "hi"),
            Message.new("behaviour", "thought about it"),
            Message.new("assistant", "hello")
          ],
          "- some fact"
        )

      assert ctx =~ "User: hi"
      assert ctx =~ "Agent did: thought about it"
      assert ctx =~ "Assistant: hello"
    end

    test "drops messages with empty cleaned content" do
      ctx =
        Interpret.build_interpretation_context(
          [
            Message.new("user", "hi"),
            Message.new("assistant", "   "),
            Message.new("user", "")
          ],
          "- f"
        )

      refute ctx =~ "Assistant:"
      assert (ctx |> String.split("User:") |> length()) == 2
    end

    test "assembles context as 'Conversation context:\\n{messages}\\n\\nMemory facts to interpret:\\n{facts}'" do
      ctx =
        Interpret.build_interpretation_context(
          [Message.new("user", "q")],
          "- f"
        )

      assert ctx == "Conversation context:\nUser: q\n\nMemory facts to interpret:\n- f"
    end

    test "does NOT inspect or mutate content beyond whitespace trimming" do
      preserved =
        "<gralkor-memory trust=\"untrusted\">memory block</gralkor-memory>\nactual content"

      ctx =
        Interpret.build_interpretation_context(
          [Message.new("user", preserved)],
          "- f"
        )

      assert ctx =~ preserved
    end
  end

  describe "ex-interpret-context > when total char length exceeds budget" do
    test "oldest messages are dropped until context fits" do
      msgs = [
        Message.new("user", String.duplicate("oldest oldest oldest ", 20)),
        Message.new("assistant", String.duplicate("middle middle middle ", 20)),
        Message.new("user", "newest")
      ]

      ctx = Interpret.build_interpretation_context(msgs, "- f", budget: 200)

      assert String.length(ctx) <= 200
      assert ctx =~ "User: newest"
      refute ctx =~ "oldest"
    end

    test "if even one message exceeds the budget, returns empty conversation context" do
      msgs = [Message.new("user", String.duplicate("x", 1000))]

      ctx = Interpret.build_interpretation_context(msgs, "- f", budget: 100)

      refute ctx =~ "User:"
      assert ctx =~ "- f"
    end
  end
end
