defmodule Gralkor.Interpret do
  @moduledoc """
  Filter retrieved graph facts down to those relevant to the conversation,
  using the configured LLM.

  Two responsibilities, each its own tree:

    * `build_interpretation_context/3` — pure: assemble the LLM prompt from
      conversation messages and a formatted facts string, dropping oldest
      messages until the prompt fits the configured char budget. Renders
      role labels using `agent_name`.
    * `interpret_facts/4` — call the LLM with that prompt and a structured-
      output schema; return the list of relevant facts the LLM selected.

  See `ex-interpret` and `ex-interpret-context` in `gralkor/TEST_TREES.md`.
  """

  alias Gralkor.Message

  @default_budget 8_000

  @type interpret_fn :: (String.t() -> {:ok, [String.t()]} | {:error, term()})

  @doc """
  Run the LLM over the conversation context + facts text, returning the
  filtered list of relevant facts.

  Raises if the LLM call returns `{:error, _}` or a non-list response.
  Raises if `agent_name` is missing or blank.
  """
  @spec interpret_facts([Message.t()], String.t(), interpret_fn(), String.t(), keyword()) ::
          [String.t()]
  def interpret_facts(messages, facts_text, interpret_fn, agent_name, opts \\ [])
      when is_list(messages) and is_binary(facts_text) and is_function(interpret_fn, 1) do
    raise_if_blank!(agent_name)
    prompt = build_interpretation_context(messages, facts_text, agent_name, opts)

    case interpret_fn.(prompt) do
      {:ok, list} when is_list(list) ->
        list

      {:error, reason} ->
        raise "interpret failed: #{inspect(reason)}"

      other ->
        raise "interpret returned malformed response: #{inspect(other)}"
    end
  end

  @doc """
  Schema for the structured-output response the LLM returns.
  """
  @spec interpret_schema() :: keyword()
  def interpret_schema do
    [
      relevantFacts: [
        type: {:list, :string},
        required: true,
        doc:
          "Each entry is one fact line copied verbatim from the input " <>
            "(preserving every timestamp parenthetical such as '(created …)', " <>
            "'(valid from …)', '(invalid since …)', '(expired …)'; dropping the " <>
            "leading '- '), followed by ' — ' and a one-sentence relevance reason."
      ]
    ]
  end

  @doc """
  Assemble the LLM prompt from conversation messages and the formatted facts.

  Drops oldest messages until the assembled prompt fits the char budget
  (`opts[:budget]`, default #{@default_budget}). Raises on blank agent_name.
  """
  @spec build_interpretation_context([Message.t()], String.t(), String.t(), keyword()) ::
          String.t()
  def build_interpretation_context(messages, facts_text, agent_name, opts \\ [])
      when is_list(messages) and is_binary(facts_text) do
    raise_if_blank!(agent_name)
    budget = Keyword.get(opts, :budget, @default_budget)

    messages
    |> labelled_lines(agent_name)
    |> fit_to_budget(facts_text, budget)
    |> assemble(facts_text)
  end

  # ── internal ────────────────────────────────────────────────

  defp raise_if_blank!(name) when is_binary(name) do
    if String.trim(name) == "" do
      raise ArgumentError, "agent_name must be a non-blank string, got #{inspect(name)}"
    end

    :ok
  end

  defp raise_if_blank!(other) do
    raise ArgumentError, "agent_name must be a non-blank string, got #{inspect(other)}"
  end

  defp labelled_lines(messages, agent_name) do
    messages
    |> Enum.map(fn m -> {m.role, String.trim(m.content)} end)
    |> Enum.reject(fn {_, c} -> c == "" end)
    |> Enum.map(fn {role, content} -> render_line(role, content, agent_name) end)
  end

  defp render_line("user", content, _agent), do: "User: #{content}"
  defp render_line("assistant", content, agent), do: "#{agent}: #{content}"
  defp render_line("behaviour", content, agent), do: "#{agent}: (behaviour: #{content})"

  defp fit_to_budget([], _facts, _budget), do: []

  defp fit_to_budget(lines, facts, budget) do
    if String.length(assemble(lines, facts)) <= budget do
      lines
    else
      [_oldest | rest] = lines
      fit_to_budget(rest, facts, budget)
    end
  end

  defp assemble(lines, facts_text) do
    "Conversation context:\n" <>
      Enum.join(lines, "\n") <>
      "\n\nMemory facts to interpret:\n" <>
      facts_text
  end
end
