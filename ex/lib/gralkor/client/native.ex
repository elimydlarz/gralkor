defmodule Gralkor.Client.Native do
  @moduledoc """
  Production `Gralkor.Client` implementation. In-process — no HTTP — talks
  to graphiti via `Gralkor.GraphitiPool` (Pythonx-backed) and to the LLM via
  `req_llm` (Elixir-side, used by `Gralkor.Distill` and `Gralkor.Interpret`).

  See `ex-client-native` in `gralkor/TEST_TREES.md`.
  """

  @behaviour Gralkor.Client

  require Logger

  alias Gralkor.CaptureBuffer
  alias Gralkor.Client
  alias Gralkor.Config
  alias Gralkor.Distill
  alias Gralkor.Format
  alias Gralkor.GraphitiPool
  alias Gralkor.Interpret
  alias Gralkor.Recall

  # ── Client behaviour ────────────────────────────────────────

  @impl Gralkor.Client
  def recall(group_id, agent_name, session_id, query) do
    raise_if_blank!(:agent_name, agent_name)

    opts = [
      search_fn: search_fn(),
      interpret_fn: interpret_fn(),
      turns_fn: turns_fn()
    ]

    opts =
      case Application.get_env(:gralkor_ex, :recall_deadline_ms) do
        nil -> opts
        ms when is_integer(ms) -> Keyword.put(opts, :deadline_ms, ms)
      end

    Recall.recall(group_id, agent_name, session_id, query, opts)
  end

  @impl Gralkor.Client
  def capture(session_id, group_id, agent_name, msgs) do
    raise_if_blank!(:session_id, session_id)
    raise_if_blank!(:agent_name, agent_name)

    if Application.get_env(:gralkor_ex, :test, false),
      do: Logger.info("[gralkor] [test] capture messages: #{format_test_messages(msgs)}")

    CaptureBuffer.append(session_id, group_id, agent_name, msgs)
  end

  defp format_test_messages(msgs) do
    msgs
    |> Enum.map(fn %Gralkor.Message{role: r, content: c} -> "(#{r}, #{inspect(c)})" end)
    |> Enum.join(", ")
    |> then(&("[" <> &1 <> "]"))
  end

  @impl Gralkor.Client
  def end_session(session_id) do
    raise_if_blank!(:session_id, session_id)
    CaptureBuffer.flush(session_id)
  end

  @impl Gralkor.Client
  def memory_add(group_id, content, source_description) do
    source = source_description || "manual"

    case GraphitiPool.add_episode(group_id, content, source) do
      :ok -> :ok
      {:error, _} = err -> err
    end
  end

  @impl Gralkor.Client
  def build_indices, do: GraphitiPool.build_indices()

  @impl Gralkor.Client
  def build_communities(group_id) do
    sanitized = Client.sanitize_group_id(group_id)
    GraphitiPool.build_communities(sanitized)
  end

  # ── Wiring ──────────────────────────────────────────────────

  defp search_fn do
    fn group_id, query, max_results ->
      case GraphitiPool.search(group_id, query, max_results) do
        {:ok, raw_facts} -> {:ok, Enum.map(raw_facts, &Format.format_fact/1)}
        {:error, _} = err -> err
      end
    end
  end

  defp interpret_fn do
    model = config() |> Config.llm_model()
    schema = Interpret.interpret_schema()

    fn prompt ->
      case ReqLLM.generate_object(model, prompt, schema) do
        {:ok, response} ->
          object = ReqLLM.Response.object(response)
          {:ok, Map.get(object, :relevantFacts) || Map.get(object, "relevantFacts") || []}

        {:error, _} = err ->
          err
      end
    end
  end

  defp distill_fn do
    model = config() |> Config.llm_model()
    schema = Distill.distill_schema()

    fn prompt ->
      case ReqLLM.generate_object(model, prompt, schema) do
        {:ok, response} ->
          object = ReqLLM.Response.object(response)
          {:ok, Map.get(object, :behaviour) || Map.get(object, "behaviour") || ""}

        {:error, _} = err ->
          err
      end
    end
  end

  @doc false
  def distill_callback, do: distill_fn()

  @doc false
  def interpret_callback, do: interpret_fn()

  defp turns_fn, do: &CaptureBuffer.turns_for/1

  defp config do
    case Application.get_env(:gralkor_ex, :config) do
      %Config{} = c -> c
      nil -> Config.from_env()
    end
  end

  defp raise_if_blank!(field, value) when is_binary(value) do
    if String.trim(value) == "" do
      raise ArgumentError,
            "Gralkor.Client.Native: #{field} must be a non-blank string, got #{inspect(value)}"
    end

    :ok
  end

  defp raise_if_blank!(field, value) do
    raise ArgumentError,
          "Gralkor.Client.Native: #{field} must be a non-blank string, got #{inspect(value)}"
  end
end
