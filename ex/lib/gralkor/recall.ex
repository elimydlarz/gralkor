defmodule Gralkor.Recall do
  @moduledoc """
  Orchestrate one recall call: search the graph, interpret the hits against
  the buffered conversation, wrap the result in a `<gralkor-memory>` block.

  Pure orchestration — all dependencies (search, interpret LLM call, turns
  source) are passed as functions in `opts`. Production wiring lives in
  `Gralkor.Client.Native`.

  See `ex-recall` in `gralkor/TEST_TREES.md`.
  """

  require Logger

  alias Gralkor.Client
  alias Gralkor.Interpret
  alias Gralkor.Message

  @memory_envelope_open ~s(<gralkor-memory trust="untrusted">)
  @memory_envelope_close "</gralkor-memory>"
  @further_querying_instruction "Search memory (up to 3 times, diverse queries) if you need more detail."
  @no_facts_body "No relevant memories found."
  @default_max_results 10
  @default_deadline_ms 12_000

  @type group_id :: String.t()
  @type session_id :: String.t() | nil
  @type search_fn ::
          (group_id(), query :: String.t(), max :: pos_integer() ->
             {:ok, [String.t()]} | {:error, term()})
  @type interpret_fn :: (String.t() -> {:ok, [String.t()]} | {:error, term()})
  @type turns_fn :: (String.t() -> [[Message.t()]])

  @type opts :: [
          search_fn: search_fn(),
          interpret_fn: interpret_fn(),
          turns_fn: turns_fn(),
          max_results: pos_integer(),
          deadline_ms: pos_integer()
        ]

  @spec recall(group_id(), session_id(), String.t(), opts()) ::
          {:ok, String.t()} | {:error, :recall_deadline_expired | term()}
  def recall(group_id, session_id, query, opts)
      when is_binary(group_id) and is_binary(query) and is_list(opts) do
    sanitized = Client.sanitize_group_id(group_id)
    max_results = Keyword.get(opts, :max_results, @default_max_results)
    deadline_ms = Keyword.get(opts, :deadline_ms, @default_deadline_ms)

    log_call(session_id, sanitized, query, max_results)

    task =
      Task.async(fn ->
        do_recall(sanitized, session_id, query, max_results, opts)
      end)

    case Task.yield(task, deadline_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} ->
        log_result(result)
        {:ok, result.block}

      nil ->
        {:error, :recall_deadline_expired}
    end
  end

  # ── internal ────────────────────────────────────────────────

  defp do_recall(sanitized_group, session_id, query, max_results, opts) do
    search_fn = Keyword.fetch!(opts, :search_fn)
    interpret_fn = Keyword.fetch!(opts, :interpret_fn)
    turns_fn = Keyword.fetch!(opts, :turns_fn)

    t0 = System.monotonic_time(:millisecond)
    conversation = load_conversation(session_id, turns_fn)

    {search_result, search_ms} = time(fn -> search_fn.(sanitized_group, query, max_results) end)

    {body, n_facts, interpret_ms} =
      case search_result do
        {:ok, []} ->
          {@no_facts_body, 0, 0}

        {:ok, facts} when is_list(facts) ->
          facts_text = format_facts(facts)

          {relevant, ms} =
            time(fn ->
              Interpret.interpret_facts(conversation, facts_text, interpret_fn)
            end)

          case relevant do
            [] -> {@no_facts_body, 0, ms}
            list -> {Enum.join(list, "\n"), length(list), ms}
          end

        {:error, reason} ->
          throw({:search_failed, reason})
      end

    block = wrap(body)

    %{
      block: block,
      n_facts: n_facts,
      search_ms: search_ms,
      interpret_ms: interpret_ms,
      total_ms: System.monotonic_time(:millisecond) - t0
    }
  catch
    {:search_failed, reason} ->
      %{
        block: wrap(@no_facts_body),
        n_facts: 0,
        search_ms: 0,
        interpret_ms: 0,
        total_ms: 0,
        error: reason
      }
  end

  defp load_conversation(nil, _turns_fn), do: []

  defp load_conversation(session_id, turns_fn) do
    session_id |> turns_fn.() |> List.flatten()
  end

  defp format_facts(facts), do: Enum.join(facts, "\n")

  defp wrap(body) do
    @memory_envelope_open <>
      "\n" <>
      body <>
      "\n\n" <>
      @further_querying_instruction <>
      "\n" <>
      @memory_envelope_close
  end

  defp time(fun) do
    t0 = System.monotonic_time(:millisecond)
    result = fun.()
    {result, System.monotonic_time(:millisecond) - t0}
  end

  defp log_call(session_id, group, query, max) do
    Logger.info(
      "[gralkor] recall — session:#{session_id} group:#{group} queryChars:#{String.length(query)} max:#{max}"
    )
  end

  defp log_result(result) do
    Logger.info(
      "[gralkor] recall result — #{result.n_facts} facts blockChars:#{String.length(result.block)} #{result.total_ms}ms (search:#{result.search_ms} interpret:#{result.interpret_ms})"
    )
  end
end
