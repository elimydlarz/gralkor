defmodule Gralkor.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      if start_server?() do
        [Gralkor.Server]
      else
        []
      end

    Supervisor.start_link(children, strategy: :one_for_one, name: Gralkor.Supervisor)
  end

  defp start_server?, do: System.get_env("GRALKOR_DATA_DIR") != nil
end
