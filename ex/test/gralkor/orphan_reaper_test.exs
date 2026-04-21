defmodule Gralkor.OrphanReaperTest do
  use ExUnit.Case, async: true

  alias Gralkor.OrphanReaper

  describe "reap/1" do
    test "when no process is listening on port 4000, returns :ok with no kill" do
      me = self()

      shell = fn cmd, args, _opts ->
        send(me, {:shell, cmd, args})

        case cmd do
          "lsof" -> {"", 1}
          _ -> flunk("unexpected shell call: #{cmd}")
        end
      end

      assert OrphanReaper.reap(shell: shell, log: fn _ -> :ok end) == :ok
      assert_received {:shell, "lsof", _}
      refute_received {:shell, "kill", _}
    end

    test "when the listener is the app's own packaged server, SIGKILLs it and returns :ok" do
      me = self()
      packaged_uvicorn = Path.join([:code.priv_dir(:gralkor_ex), "server", ".venv", "bin", "uvicorn"])
      packaged_cmdline = "#{packaged_uvicorn} main:app --host 127.0.0.1 --port 4000"

      shell = fn
        "lsof", _, _ ->
          {"12345\n", 0}

        "ps", ["-o", "command=", "-p", "12345"], _ ->
          {packaged_cmdline, 0}

        "kill", ["-9", "12345"], _ ->
          send(me, {:killed, "12345"})
          {"", 0}
      end

      logs = fn msg -> send(me, {:log, msg}) end

      assert OrphanReaper.reap(shell: shell, log: logs) == :ok
      assert_received {:killed, "12345"}
      assert_received {:log, "[orphan_reaper] killing orphan uvicorn pid=12345"}
    end

    test "when a foreign process holds port 4000, raises with the foreign command line" do
      shell = fn
        "lsof", _, _ ->
          {"99999\n", 0}

        "ps", _, _ ->
          {"/usr/local/bin/some-other-service\n", 0}
      end

      assert_raise RuntimeError,
                   ~r{port 4000 held by foreign process: /usr/local/bin/some-other-service},
                   fn ->
                     OrphanReaper.reap(shell: shell, log: fn _ -> :ok end)
                   end
    end
  end
end
