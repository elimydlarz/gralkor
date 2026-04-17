defmodule Gralkor.ServerTest do
  @moduledoc """
  Tree: ex-server-lifecycle.

  Integration-style: spawns a real OS process (fake_gralkor.py) via the
  Gralkor.Server GenServer and validates boot + health poll + SIGTERM path.
  """

  use ExUnit.Case, async: false

  @moduletag :integration

  alias Gralkor.Config
  alias Gralkor.Server

  @fixture_path Path.expand("../fixtures/fake_gralkor.py", __DIR__)
  @port 4199

  setup context do
    tmp = Path.join(System.tmp_dir!(), "gralkor-server-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)

    config = %Config{
      data_dir: tmp,
      server_dir: System.tmp_dir!(),
      server_url: "http://127.0.0.1:#{@port}",
      auth_token: "test-tok",
      llm_provider: "gemini",
      embedder_provider: "gemini"
    }

    context
    |> Map.put(:config, config)
    |> Map.put(:python_exe, System.find_executable("python3") || flunk("python3 required"))
  end

  test "init does not block", %{config: config, python_exe: python} do
    name = unique_name()

    parent = self()

    spawn(fn ->
      result =
        Server.start_link(
          name: name,
          config: config,
          executable: python,
          executable_args: [@fixture_path, Integer.to_string(@port)]
        )

      send(parent, {:start_result, result})
    end)

    assert_receive {:start_result, {:ok, pid}}, 5_000
    assert Process.alive?(pid)

    :ok = stop_and_wait(pid)
  end

  test "boot succeeds when health endpoint returns 200", %{config: config, python_exe: python} do
    name = unique_name()

    {:ok, pid} =
      Server.start_link(
        name: name,
        config: config,
        executable: python,
        executable_args: [@fixture_path, Integer.to_string(@port)]
      )

    wait_for_healthy(pid, 10_000)

    config_yaml = Path.join(config.data_dir, "config.yaml")
    assert File.exists?(config_yaml)

    :ok = stop_and_wait(pid)
  end

  test "terminate sends SIGTERM and the child exits", %{config: config, python_exe: python} do
    name = unique_name()

    {:ok, pid} =
      Server.start_link(
        name: name,
        config: config,
        executable: python,
        executable_args: [@fixture_path, Integer.to_string(@port)]
      )

    wait_for_healthy(pid, 10_000)
    os_pid = :sys.get_state(pid).os_pid
    assert is_integer(os_pid)

    :ok = stop_and_wait(pid)

    refute os_process_alive?(os_pid)
  end

  test "boot fails when server does not respond", %{config: config, python_exe: _python} do
    name = unique_name()

    Process.flag(:trap_exit, true)

    {:ok, pid} =
      Server.start_link(
        name: name,
        config: config,
        executable: "/bin/true",
        executable_args: []
      )

    ref = Process.monitor(pid)

    assert_receive {:DOWN, ^ref, :process, ^pid, reason}, 200_000
    assert match?({:boot_failed, _}, reason) or match?({:python_exited, _}, reason)
  end

  @tag timeout: 200_000
  test "python crash stops the GenServer", %{config: config, python_exe: python} do
    name = unique_name()

    Process.flag(:trap_exit, true)

    {:ok, pid} =
      Server.start_link(
        name: name,
        config: config,
        executable: python,
        executable_args: [@fixture_path, Integer.to_string(@port)]
      )

    wait_for_healthy(pid, 10_000)
    os_pid = :sys.get_state(pid).os_pid

    ref = Process.monitor(pid)
    System.cmd("kill", ["-KILL", Integer.to_string(os_pid)], stderr_to_stdout: true)

    assert_receive {:DOWN, ^ref, :process, ^pid, reason}, 10_000
    assert match?({:python_exited, _}, reason) or match?({:python_port_exit, _}, reason)
  end

  # ── helpers ────────────────────────────────────────────

  defp unique_name, do: :"server_test_#{System.unique_integer([:positive])}"

  defp wait_for_healthy(pid, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    do_wait_healthy(pid, deadline)
  end

  defp do_wait_healthy(pid, deadline) do
    state = :sys.get_state(pid)

    if state.port != nil and state.os_pid != nil do
      :ok
    else
      if System.monotonic_time(:millisecond) >= deadline do
        flunk("server did not become healthy")
      else
        Process.sleep(100)
        do_wait_healthy(pid, deadline)
      end
    end
  end

  defp stop_and_wait(pid) do
    ref = Process.monitor(pid)

    try do
      GenServer.stop(pid, :normal, 10_000)
    catch
      :exit, _ -> :ok
    end

    receive do
      {:DOWN, ^ref, :process, ^pid, _} -> :ok
    after
      5_000 -> :ok
    end
  end

  defp os_process_alive?(os_pid) do
    {_, exit_code} = System.cmd("kill", ["-0", Integer.to_string(os_pid)], stderr_to_stdout: true)
    exit_code == 0
  end
end
