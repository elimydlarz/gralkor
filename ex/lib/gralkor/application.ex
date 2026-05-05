defmodule Gralkor.Application do
  @moduledoc false

  use Application

  alias Gralkor.CaptureBuffer
  alias Gralkor.Client.Native
  alias Gralkor.Config
  alias Gralkor.Distill
  alias Gralkor.GraphitiPool

  @impl true
  def start(_type, _args) do
    Supervisor.start_link(children(), strategy: :one_for_one, name: Gralkor.Supervisor)
  end

  @doc false
  def children do
    cond do
      Application.get_env(:gralkor_ex, :client) == Gralkor.Client.InMemory ->
        []

      System.get_env("GRALKOR_DATA_DIR") == nil ->
        []

      true ->
        config = Config.from_env()

        [
          Gralkor.Python,
          {GraphitiPool,
           [
             data_dir: config.data_dir,
             llm_model: Config.llm_model(config),
             embedder_model: Config.embedder_model(config),
             interpret_fn: Native.interpret_callback()
           ]},
          {CaptureBuffer, [flush_callback: build_flush_callback(config)]}
        ]
    end
  end

  defp build_flush_callback(_config) do
    distill_fn = Native.distill_callback()

    fn group_id, turns ->
      body = Distill.format_transcript(turns, distill_fn)

      cond do
        body == "" ->
          :ok

        true ->
          GraphitiPool.add_episode(group_id, body, "captured")
      end
    end
  end
end
