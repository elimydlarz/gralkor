defmodule Gralkor.Server do
  @moduledoc """
  Supervises a single Python uvicorn process via Port.

  - init/1 never blocks; handle_continue(:boot) runs the slow work.
  - Boot sequence: write config.yaml → Port.open(uv run uvicorn) → health-poll
    at 500ms until 200 or 120s timeout → schedule 60s monitor.
  - Health monitor stops the GenServer on failure; supervisor restarts.
  - Graceful shutdown: SIGTERM the OS pid, wait up to 30s for {:exit_status, _},
    then SIGKILL.
  """

  use GenServer

  require Logger

  alias Gralkor.Config
  alias Gralkor.Health

  @health_poll_interval_ms 500
  @default_boot_timeout_ms 120_000
  @default_monitor_interval_ms 60_000
  @shutdown_grace_ms 30_000

  @type state :: %{
          config: Config.t(),
          port: port() | nil,
          os_pid: non_neg_integer() | nil,
          opts: keyword()
        }

  # ── Public API ────────────────────────────────────────────

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name, __MODULE__))
  end

  # ── GenServer callbacks ──────────────────────────────────

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)
    config = Keyword.get_lazy(opts, :config, &Config.from_env/0)

    state = %{
      config: config,
      port: nil,
      os_pid: nil,
      opts: opts
    }

    {:ok, state, {:continue, :boot}}
  end

  @impl true
  def handle_continue(:boot, state) do
    :ok = Config.write_yaml(state.config)

    port = spawn_python(state.config, state.opts)
    {:os_pid, os_pid} = Port.info(port, :os_pid)
    boot_timeout_ms = Keyword.get(state.opts, :boot_timeout_ms, @default_boot_timeout_ms)

    case wait_for_health(state.config.server_url, port, boot_timeout_ms) do
      :ok ->
        Process.send_after(self(), :health_check, @monitor_interval_ms)
        {:noreply, %{state | port: port, os_pid: os_pid}}

      {:error, reason} ->
        kill_os_pid(os_pid, "KILL")
        {:stop, {:boot_failed, reason}, state}
    end
  end

  @impl true
  def handle_info(:health_check, state) do
    case Health.check(state.config.server_url) do
      :ok ->
        Process.send_after(self(), :health_check, @monitor_interval_ms)
        {:noreply, state}

      {:error, reason} ->
        Logger.error("[gralkor] health degraded: #{inspect(reason)}")
        {:stop, {:health_degraded, reason}, state}
    end
  end

  def handle_info({port, {:exit_status, status}}, %{port: port} = state) do
    Logger.error("[gralkor] python exited status=#{status}")
    {:stop, {:python_exited, status}, %{state | port: nil, os_pid: nil}}
  end

  def handle_info({:EXIT, port, reason}, %{port: port} = state) do
    Logger.error("[gralkor] python port exited: #{inspect(reason)}")
    {:stop, {:python_port_exit, reason}, %{state | port: nil, os_pid: nil}}
  end

  def handle_info({port, {:data, data}}, %{port: port} = state) do
    for line <- String.split(data, "\n", trim: true), do: Logger.info("[python] #{line}")
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, %{os_pid: nil}), do: :ok

  def terminate(_reason, %{os_pid: os_pid, port: port}) do
    kill_os_pid(os_pid, "TERM")

    case wait_for_exit(port, @shutdown_grace_ms) do
      :ok ->
        :ok

      :timeout ->
        kill_os_pid(os_pid, "KILL")
        :ok
    end
  end

  # ── Internals ───────────────────────────────────────────

  defp spawn_python(%Config{} = config, opts) do
    executable =
      Keyword.get_lazy(opts, :executable, fn ->
        System.find_executable("uv") || raise "uv not on PATH"
      end)

    args = Keyword.get_lazy(opts, :executable_args, fn -> default_uvicorn_args() end)

    port_opts = [
      :binary,
      :exit_status,
      {:args, args},
      {:cd, config.server_dir},
      {:env, build_env(config)}
    ]

    Port.open({:spawn_executable, executable}, port_opts)
  end

  defp default_uvicorn_args do
    [
      "run",
      "uvicorn",
      "main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "4000",
      "--timeout-graceful-shutdown",
      "30"
    ]
  end

  defp build_env(%Config{} = config) do
    base = [
      {~c"CONFIG_PATH", String.to_charlist(Path.join(config.data_dir, "config.yaml"))},
      {~c"FALKORDB_DATA_DIR", String.to_charlist(Path.join(config.data_dir, "falkordb"))},
      {~c"AUTH_TOKEN", String.to_charlist(config.auth_token)}
    ]

    forwarded =
      for name <- ["GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY"],
          value = System.get_env(name),
          is_binary(value) and value != "" do
        {String.to_charlist(name), String.to_charlist(value)}
      end

    base ++ forwarded
  end

  defp wait_for_health(url, port, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    do_wait_for_health(url, port, deadline)
  end

  defp do_wait_for_health(url, port, deadline) do
    cond do
      port_exited?(port) ->
        {:error, :port_exited}

      match?(:ok, Health.check(url)) ->
        :ok

      System.monotonic_time(:millisecond) >= deadline ->
        {:error, :boot_timeout}

      true ->
        Process.sleep(@health_poll_interval_ms)
        do_wait_for_health(url, port, deadline)
    end
  end

  defp port_exited?(port) do
    receive do
      {^port, {:exit_status, _}} = msg ->
        send(self(), msg)
        true

      {:EXIT, ^port, _} = msg ->
        send(self(), msg)
        true
    after
      0 -> false
    end
  end

  defp wait_for_exit(nil, _timeout_ms), do: :ok

  defp wait_for_exit(port, timeout_ms) do
    receive do
      {^port, {:exit_status, _}} -> :ok
      {:EXIT, ^port, _} -> :ok
    after
      timeout_ms -> :timeout
    end
  end

  defp kill_os_pid(os_pid, signal) when is_integer(os_pid) do
    _ = System.cmd("kill", ["-" <> signal, Integer.to_string(os_pid)], stderr_to_stdout: true)
    :ok
  end

  defp kill_os_pid(_os_pid, _signal), do: :ok
end
