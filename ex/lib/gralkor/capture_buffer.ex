defmodule Gralkor.CaptureBuffer do
  @moduledoc """
  In-flight conversation buffer keyed by `session_id`.

  Holds turns until an explicit flush — session lifetime is owned by the
  consumer; there is no idle-flush policy. On `flush/1` (or shutdown via
  `flush_all/0` from `terminate/2`), the buffered turns are handed to the
  configured `flush_callback` with retry: server-internal failures get the
  configured backoff (default 1s/2s/4s); contract errors (4xx) and
  upstream-LLM errors drop without retry.

  See `ex-capture-buffer` in `gralkor/TEST_TREES.md`.
  """

  use GenServer

  require Logger

  alias Gralkor.Client

  @default_retries [1_000, 2_000, 4_000]

  # ── Public API ──────────────────────────────────────────────

  def start_link(opts) when is_list(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Append one turn (a list of `Gralkor.Message`) to the session's buffer.

  `agent_name` is required and non-blank — it is bound on first append for
  the session and any later append with a different `agent_name` (or
  `group_id`) raises `ArgumentError`.
  """
  def append(session_id, group_id, agent_name, msgs)
      when is_binary(session_id) and is_binary(group_id) and is_list(msgs) do
    raise_if_blank_agent!(agent_name)

    case GenServer.call(__MODULE__, {:append, session_id, group_id, agent_name, msgs}) do
      :ok ->
        :ok

      {:group_mismatch, sanitized, other_group} ->
        raise ArgumentError,
              "session #{inspect(session_id)} is bound to group #{inspect(other_group)}; " <>
                "refusing to append under group #{inspect(sanitized)}"

      {:agent_mismatch, new_agent, bound_agent} ->
        raise ArgumentError,
              "session #{inspect(session_id)} is bound to agent #{inspect(bound_agent)}; " <>
                "refusing to append under agent #{inspect(new_agent)}"
    end
  end

  @doc "Return the buffered turns for `session_id`, or `[]` if none."
  def turns_for(session_id) when is_binary(session_id) do
    GenServer.call(__MODULE__, {:turns_for, session_id})
  end

  @doc "Schedule a retry-backed flush of the session's turns. Returns `:ok` immediately."
  def flush(session_id) when is_binary(session_id) do
    GenServer.call(__MODULE__, {:flush, session_id})
  end

  @doc "Flush every buffered session and await each. Used at shutdown."
  def flush_all do
    GenServer.call(__MODULE__, :flush_all, :infinity)
  end

  # ── GenServer ──────────────────────────────────────────────

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)

    {:ok,
     %{
       entries: %{},
       flush_callback: Keyword.fetch!(opts, :flush_callback),
       retries: Keyword.get(opts, :retries, @default_retries)
     }}
  end

  @impl true
  def handle_call({:append, session_id, group_id, agent_name, msgs}, _from, state) do
    sanitized = Client.sanitize_group_id(group_id)

    case Map.get(state.entries, session_id) do
      nil ->
        entries =
          Map.put(state.entries, session_id, {sanitized, agent_name, [msgs]})

        {:reply, :ok, %{state | entries: entries}}

      {^sanitized, ^agent_name, turns} ->
        entries =
          Map.put(state.entries, session_id, {sanitized, agent_name, turns ++ [msgs]})

        {:reply, :ok, %{state | entries: entries}}

      {other_group, _bound_agent, _turns} when other_group != sanitized ->
        {:reply, {:group_mismatch, sanitized, other_group}, state}

      {^sanitized, bound_agent, _turns} ->
        {:reply, {:agent_mismatch, agent_name, bound_agent}, state}
    end
  end

  def handle_call({:turns_for, session_id}, _from, state) do
    case Map.get(state.entries, session_id) do
      nil -> {:reply, [], state}
      {_group, _agent, turns} -> {:reply, turns, state}
    end
  end

  def handle_call({:flush, session_id}, _from, state) do
    case Map.pop(state.entries, session_id) do
      {nil, _entries} ->
        Logger.info("[gralkor] flush — session:#{session_id} empty")
        {:reply, :ok, state}

      {{group, agent, turns}, entries} ->
        Logger.info("[gralkor] flush scheduled — session:#{session_id} turns:#{length(turns)}")
        Task.start(fn -> do_flush(group, agent, turns, state.flush_callback, state.retries) end)
        {:reply, :ok, %{state | entries: entries}}
    end
  end

  def handle_call(:flush_all, _from, state) do
    tasks =
      for {_session_id, {group, agent, turns}} <- state.entries do
        Task.async(fn -> do_flush(group, agent, turns, state.flush_callback, state.retries) end)
      end

    Task.await_many(tasks, :infinity)
    {:reply, :ok, %{state | entries: %{}}}
  end

  @impl true
  def terminate(_reason, state) do
    for {_session_id, {group, agent, turns}} <- state.entries do
      do_flush(group, agent, turns, state.flush_callback, state.retries)
    end

    :ok
  end

  # ── Flush worker ────────────────────────────────────────────

  defp do_flush(group, agent, turns, cb, retries) do
    do_flush(group, agent, turns, cb, retries, System.monotonic_time(:millisecond))
  end

  defp do_flush(group, agent, turns, cb, retries, t0) do
    case safe_invoke(cb, group, agent, turns) do
      :ok ->
        elapsed = System.monotonic_time(:millisecond) - t0
        Logger.info("[gralkor] capture flushed — turns:#{length(turns)} elapsed:#{elapsed}ms")
        :ok

      {:error, :capture_client_4xx} ->
        Logger.warning("[gralkor] capture dropped (4xx)")
        :dropped

      {:error, {:upstream_llm, _}} ->
        Logger.warning("[gralkor] capture dropped (upstream error)")
        :dropped

      {:error, _reason} ->
        retry(group, agent, turns, cb, retries, t0)

      {:exception, exception, stacktrace} ->
        Logger.warning(
          "[gralkor] capture flush raised — retrying. " <>
            Exception.format(:error, exception, stacktrace)
        )

        retry(group, agent, turns, cb, retries, t0)
    end
  end

  defp safe_invoke(cb, group, agent, turns) do
    cb.(group, agent, turns)
  rescue
    e -> {:exception, e, __STACKTRACE__}
  end

  defp retry(_group, _agent, _turns, _cb, [], _t0) do
    Logger.error("[gralkor] capture exhausted")
    :exhausted
  end

  defp retry(group, agent, turns, cb, [delay | rest], t0) do
    Process.sleep(delay)
    do_flush(group, agent, turns, cb, rest, t0)
  end

  defp raise_if_blank_agent!(name) when is_binary(name) do
    if String.trim(name) == "" do
      raise ArgumentError, "agent_name must be a non-blank string, got #{inspect(name)}"
    end

    :ok
  end

  defp raise_if_blank_agent!(other) do
    raise ArgumentError, "agent_name must be a non-blank string, got #{inspect(other)}"
  end
end
