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

    test "when the listener's path differs from :code.priv_dir (path-dep symlink resolution), still recognizes by command-line identifiers and SIGKILLs" do
      me = self()

      # Simulates the command line seen when susu-2 uses a path dep to ../gralkor/ex:
      # mix symlinks the priv dir, ps reports the resolved physical path, which
      # does not contain :code.priv_dir(:gralkor_ex) as a substring.
      resolved_cmdline =
        "/opt/homebrew/bin/python3.13 /Users/someone/projects/gralkor-and-friends/gralkor/ex/priv/server/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 4000 --no-access-log --timeout-graceful-shutdown 30"

      shell = fn
        "lsof", _, _ ->
          {"54321\n", 0}

        "ps", ["-o", "command=", "-p", "54321"], _ ->
          {resolved_cmdline, 0}

        "kill", ["-9", "54321"], _ ->
          send(me, {:killed, "54321"})
          {"", 0}
      end

      assert OrphanReaper.reap(shell: shell, log: fn _ -> :ok end) == :ok
      assert_received {:killed, "54321"}
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
