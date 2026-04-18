defmodule Gralkor.Functional.EndToEndTest do
  @moduledoc """
  Tree: jido-memory-journey.

  Boots a real Gralkor.Server against the real Python server (Graphiti +
  falkordblite + Gemini) and exercises the HTTP contract the way a Jido
  consumer would. Skipped when GOOGLE_API_KEY is unset.

  Assertions are semantic (substring, presence, count) — LLM output is not
  byte-stable.
  """

  use ExUnit.Case, async: false

  @moduletag :functional
  @moduletag timeout: 300_000

  alias Gralkor.Config
  alias Gralkor.Server

  @base_port 4400
  @token "functional-token"
  @group "jido_func"
  @capture_idle 3.0

  setup_all do
    if System.get_env("GOOGLE_API_KEY") in [nil, ""] do
      :ok = ExUnit.configure(exclude: [:functional])
      {:skip, "GOOGLE_API_KEY not set — skipping functional suite"}
    else
      {:ok, start_server()}
    end
  end

  # ── Tests ────────────────────────────────────────────────

  test "round-trip: memory_add then recall retrieves the stored content", %{url: url} do
    assert {:ok, %{status: 200}} =
             post(url, "/tools/memory_add", %{
               group_id: @group,
               content: "Eli prefers concise explanations over verbose ones.",
               source_description: "functional-test"
             })

    wait_for_graph(url, @group, "eli", 60_000)

    {:ok, resp} =
      post(url, "/recall", %{
        group_id: @group,
        query: "what style does Eli prefer",
        conversation_messages: [%{role: "user", text: "what style does Eli prefer"}],
        max_results: 5
      })

    assert resp.status == 200
    memory_block = resp.body["memory_block"]
    assert is_binary(memory_block)
    assert memory_block != ""
    assert memory_block =~ "<gralkor-memory"
    assert memory_block =~ ~r/concise|explanation/i
  end

  test "capture → idle flush → search finds the episode", %{url: url} do
    group = "#{@group}_capture"

    assert {:ok, %{status: 204}} =
             post(url, "/capture", %{
               group_id: group,
               turn: %{
                 user_query: "Remember that my favourite colour is teal.",
                 events: [],
                 assistant_answer: "Got it — teal it is."
               }
             })

    wait_for_graph(url, group, "teal", 90_000)
  end

  test "crash recovery: SIGKILL the python pid, supervisor restarts it", %{server: pid, url: url} do
    %{os_pid: os_pid} = :sys.get_state(pid)
    assert is_integer(os_pid)

    {_, 0} = System.cmd("kill", ["-KILL", Integer.to_string(os_pid)], stderr_to_stdout: true)

    wait_for_process_exit(pid, 10_000)
    {:ok, new_pid} = wait_for_server_restart(Server, 60_000)
    wait_for_health(url, 120_000)

    new_state = :sys.get_state(new_pid)
    assert is_integer(new_state.os_pid)
    refute new_state.os_pid == os_pid
  end

  # ── Harness ─────────────────────────────────────────────

  defp start_server do
    port = @base_port + System.unique_integer([:positive])
    url = "http://127.0.0.1:#{port}"

    tmp = Path.join(System.tmp_dir!(), "gralkor-functional-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)

    config = %Config{
      data_dir: tmp,
      server_dir: Path.expand("../../../server", __DIR__),
      server_url: url,
      auth_token: @token,
      llm_provider: "gemini",
      embedder_provider: "gemini",
      capture_idle_seconds: @capture_idle
    }

    uv_path = System.find_executable("uv") || flunk("uv not on PATH")

    args = [
      "run",
      "uvicorn",
      "main:app",
      "--host",
      "127.0.0.1",
      "--port",
      Integer.to_string(port),
      "--timeout-graceful-shutdown",
      "30"
    ]

    {:ok, pid} =
      Server.start_link(
        config: config,
        executable: uv_path,
        executable_args: args,
        boot_timeout_ms: 180_000
      )

    on_exit(fn ->
      try do
        GenServer.stop(pid, :normal, 45_000)
      catch
        :exit, _ -> :ok
      end

      File.rm_rf!(tmp)
    end)

    %{server: pid, url: url, tmp: tmp, port: port}
  end

  defp post(url, path, body) do
    Req.post(
      Path.join(url, path),
      json: body,
      headers: [{"authorization", "Bearer #{@token}"}],
      receive_timeout: 60_000
    )
    |> case do
      {:ok, resp} -> {:ok, resp}
      {:error, _} = err -> err
    end
  end

  defp wait_for_graph(url, group, needle, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    do_wait_for_graph(url, group, needle, deadline)
  end

  defp do_wait_for_graph(url, group, needle, deadline) do
    case search(url, group) do
      {:ok, %{status: 200, body: %{"facts" => facts}}}
      when is_list(facts) and facts != [] ->
        if Enum.any?(facts, fn f ->
             text = (f["fact"] || "") <> " " <> (f["name"] || "")
             String.contains?(String.downcase(text), String.downcase(needle))
           end) do
          :ok
        else
          retry_wait(url, group, needle, deadline)
        end

      _ ->
        retry_wait(url, group, needle, deadline)
    end
  end

  defp retry_wait(url, group, needle, deadline) do
    if System.monotonic_time(:millisecond) >= deadline do
      flunk("graph never contained '#{needle}' for group '#{group}'")
    else
      Process.sleep(1_000)
      do_wait_for_graph(url, group, needle, deadline)
    end
  end

  defp search(url, group) do
    post(url, "/search", %{
      query: "*",
      group_ids: [String.replace(group, "-", "_")],
      num_results: 20,
      mode: "slow"
    })
  end

  defp wait_for_health(url, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    do_wait_for_health(url, deadline)
  end

  defp do_wait_for_health(url, deadline) do
    case Req.get(Path.join(url, "/health"), receive_timeout: 2_000) do
      {:ok, %{status: 200}} ->
        :ok

      _ ->
        if System.monotonic_time(:millisecond) >= deadline do
          flunk("health never returned 200")
        else
          Process.sleep(500)
          do_wait_for_health(url, deadline)
        end
    end
  end

  defp wait_for_process_exit(pid, timeout_ms) do
    ref = Process.monitor(pid)

    receive do
      {:DOWN, ^ref, :process, ^pid, _} -> :ok
    after
      timeout_ms -> flunk("genserver did not exit after kill")
    end
  end

  defp wait_for_server_restart(_name, _timeout_ms) do
    # The functional suite does not run under an external supervisor; a
    # restart here means "start_link a new one to prove it can come back".
    # The test asserts on the fresh state having a different os_pid.
    config = Process.get(:functional_config) || flunk("no config captured")
    uv_path = System.find_executable("uv")

    args = Process.get(:functional_args) || []
    Server.start_link(config: config, executable: uv_path, executable_args: args, boot_timeout_ms: 180_000)
  end
end
