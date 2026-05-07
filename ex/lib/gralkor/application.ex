defmodule Gralkor.Application do
  @moduledoc false

  use Application

  require Logger

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

  @doc false
  def build_flush_callback(_config, deps \\ []) do
    distill_fn = Keyword.get_lazy(deps, :distill_fn, &Native.distill_callback/0)
    add_episode_fn = Keyword.get(deps, :add_episode_fn, &GraphitiPool.add_episode/3)

    fn group_id, agent_name, turns ->
      body = Distill.format_transcript(turns, distill_fn, agent_name)

      cond do
        body == "" ->
          :ok

        true ->
          t0 = System.monotonic_time(:millisecond)
          result = add_episode_fn.(group_id, body, "captured")
          ms = System.monotonic_time(:millisecond) - t0

          Logger.info(
            "[gralkor] capture flushed — group:#{group_id} bodyChars:#{String.length(body)} #{ms}ms"
          )

          if Application.get_env(:gralkor_ex, :test, false),
            do: Logger.info("[gralkor] [test] capture flush body: #{body}")

          result
      end
    end
  end
end
