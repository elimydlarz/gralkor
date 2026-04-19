defmodule Gralkor.Client do
  @moduledoc """
  Port for talking to a Gralkor backend from Elixir.

  Six operations — recall, capture, end_session, memory_search, memory_add,
  health_check. Every failure is reported as `{:error, reason}` so callers
  can decide how to fail open. Group IDs are sanitised at the edge
  (`sanitize_group_id/1`) to satisfy Gralkor's RediSearch constraint.

  The concrete adapter is resolved from `Application.get_env(:gralkor, :client)`;
  defaults to `Gralkor.Client.HTTP`. Tests swap in `Gralkor.Client.InMemory`.
  """

  @type group_id :: String.t()
  @type session_id :: String.t()
  @type turn :: %{
          user_query: String.t(),
          assistant_answer: String.t(),
          events: list(map())
        }

  @callback recall(group_id(), session_id(), query :: String.t()) ::
              {:ok, String.t() | nil} | {:error, term()}
  @callback capture(session_id(), group_id(), turn()) :: :ok | {:error, term()}
  @callback memory_search(group_id(), session_id(), query :: String.t()) ::
              {:ok, String.t()} | {:error, term()}
  @callback memory_add(group_id(), content :: String.t(), source_description :: String.t() | nil) ::
              :ok | {:error, term()}
  @callback end_session(session_id()) :: :ok | {:error, term()}
  @callback health_check() :: :ok | {:error, term()}

  @spec impl() :: module()
  def impl, do: Application.get_env(:gralkor, :client, Gralkor.Client.HTTP)

  @spec sanitize_group_id(String.t()) :: String.t()
  def sanitize_group_id(id) when is_binary(id), do: String.replace(id, "-", "_")
end
