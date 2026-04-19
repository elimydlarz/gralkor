defmodule Gralkor.Connection do
  @moduledoc """
  Boot-readiness gate for a Gralkor backend.

  `init/1` synchronously polls `Gralkor.Client.impl().health_check/0`
  until it responds healthy or the boot window expires. A timeout stops
  the GenServer with `{:gralkor_unreachable, reason}` so the consumer's
  supervisor decides whether to retry or give up.

  After boot this process sits idle. Runtime outages surface via
  fail-fast on the next actual call; `Gralkor.Server`'s own health
  monitor is what restarts the Python child if `/health` starts
  failing. Duplicating that monitoring here races uvicorn's HTTP
  keep-alive and produces spurious `up → down` transitions.
  """

  use GenServer

  alias Gralkor.Client

  @default_boot_window_ms 120_000
  @default_boot_backoff_ms 500

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    boot_window = Keyword.get(opts, :boot_window_ms, @default_boot_window_ms)
    boot_backoff = Keyword.get(opts, :boot_backoff_ms, @default_boot_backoff_ms)

    deadline = System.monotonic_time(:millisecond) + boot_window

    case wait_until_healthy(deadline, boot_backoff) do
      :ok ->
        {:ok, %{}}

      {:error, reason} ->
        {:stop, {:gralkor_unreachable, reason}}
    end
  end

  defp wait_until_healthy(deadline, backoff_ms) do
    case Client.impl().health_check() do
      :ok ->
        :ok

      {:error, reason} ->
        if System.monotonic_time(:millisecond) + backoff_ms >= deadline do
          {:error, reason}
        else
          Process.sleep(backoff_ms)
          wait_until_healthy(deadline, backoff_ms)
        end
    end
  end
end
