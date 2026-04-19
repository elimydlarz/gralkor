defmodule Gralkor.Client.InMemory do
  @moduledoc """
  In-memory twin of `Gralkor.Client` for tests.

  Configure responses per operation before exercising the code under test;
  inspect the calls that were made after. Operations with no configured
  response return `{:error, :not_configured}` — tests should set every
  response they expect the code under test to hit.
  """

  @behaviour Gralkor.Client

  use GenServer

  # ── Test API ────────────────────────────────────────────────

  def start_link(_opts \\ []),
    do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "Reset all state — call in `setup`."
  def reset, do: GenServer.call(__MODULE__, :reset)

  @doc "Set the response for the next (and all subsequent) `recall/3` calls."
  def set_recall(response), do: GenServer.call(__MODULE__, {:set, :recall, response})

  @doc "Set the response for the next (and all subsequent) `capture/3` calls."
  def set_capture(response), do: GenServer.call(__MODULE__, {:set, :capture, response})

  @doc "Set the response for the next (and all subsequent) `memory_search/3` calls."
  def set_memory_search(response), do: GenServer.call(__MODULE__, {:set, :memory_search, response})

  @doc "Set the response for the next (and all subsequent) `memory_add/3` calls."
  def set_memory_add(response), do: GenServer.call(__MODULE__, {:set, :memory_add, response})

  @doc "Set the response for the next (and all subsequent) `end_session/1` calls."
  def set_end_session(response), do: GenServer.call(__MODULE__, {:set, :end_session, response})

  @doc "Set the response for the next (and all subsequent) `health_check/0` calls."
  def set_health(response), do: GenServer.call(__MODULE__, {:set, :health_check, response})

  def recalls, do: GenServer.call(__MODULE__, {:calls, :recall})
  def captures, do: GenServer.call(__MODULE__, {:calls, :capture})
  def searches, do: GenServer.call(__MODULE__, {:calls, :memory_search})
  def adds, do: GenServer.call(__MODULE__, {:calls, :memory_add})
  def end_sessions, do: GenServer.call(__MODULE__, {:calls, :end_session})
  def health_checks, do: GenServer.call(__MODULE__, {:calls, :health_check})

  # ── Client behaviour ────────────────────────────────────────

  @impl Gralkor.Client
  def recall(group_id, session_id, query),
    do: GenServer.call(__MODULE__, {:call, :recall, [group_id, session_id, query]})

  @impl Gralkor.Client
  def capture(session_id, group_id, turn),
    do: GenServer.call(__MODULE__, {:call, :capture, [session_id, group_id, turn]})

  @impl Gralkor.Client
  def memory_search(group_id, session_id, query),
    do: GenServer.call(__MODULE__, {:call, :memory_search, [group_id, session_id, query]})

  @impl Gralkor.Client
  def memory_add(group_id, content, source),
    do: GenServer.call(__MODULE__, {:call, :memory_add, [group_id, content, source]})

  @impl Gralkor.Client
  def end_session(session_id),
    do: GenServer.call(__MODULE__, {:call, :end_session, [session_id]})

  @impl Gralkor.Client
  def health_check,
    do: GenServer.call(__MODULE__, {:call, :health_check, []})

  # ── GenServer ──────────────────────────────────────────────

  @impl GenServer
  def init(:ok), do: {:ok, empty_state()}

  @impl GenServer
  def handle_call(:reset, _from, _state), do: {:reply, :ok, empty_state()}

  def handle_call({:set, op, response}, _from, state),
    do: {:reply, :ok, put_in(state.responses[op], response)}

  def handle_call({:calls, op}, _from, state),
    do: {:reply, Enum.reverse(Map.get(state.calls, op, [])), state}

  def handle_call({:call, op, args}, _from, state) do
    state = update_in(state.calls[op], &[args | &1 || []])
    response = Map.get(state.responses, op, {:error, :not_configured})
    {:reply, response, state}
  end

  defp empty_state, do: %{responses: %{}, calls: %{}}
end
