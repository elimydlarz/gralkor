defmodule Gralkor.OrphanReaper do
  @moduledoc """
  Pre-OTP cleanup for a stale uvicorn left bound to Gralkor's port.

  Intended to run *before* the OTP supervision tree starts — specifically
  before `Gralkor.Server`'s boot sequence, whose `:port_in_use` check
  refuses to clean up foreign holders and crashes.

  Rationale: a BEAM abort (Ctrl+C → `a`, SIGKILL, crash) doesn't reliably
  run Gralkor.Server's graceful-shutdown path, which is the only path
  that SIGTERMs the uvicorn OS pid. So aborts sometimes leave uvicorn orphaned
  (reparented to launchd) with port 4000 still bound. The reaper looks
  for such an orphan, verifies it is ours (command line contains
  `gralkor_ex/priv/server` — the packaged server path under
  `:code.priv_dir(:gralkor_ex)`), and SIGKILLs it. If the holder is
  anything else, the reaper raises — we don't kill foreign processes.

  `System.cmd/3` is injectable via `opts[:shell]` so the logic is
  unit-testable without side effects.
  """

  @port 4000
  @marker "gralkor_ex/priv/server"

  @type shell :: (String.t(), [String.t()], keyword() -> {String.t(), integer()})

  @spec reap(keyword()) :: :ok | no_return()
  def reap(opts \\ []) do
    sh = Keyword.get(opts, :shell, &System.cmd/3)
    log = Keyword.get(opts, :log, &default_log/1)

    case sh.("lsof", ["-nP", "-iTCP:#{@port}", "-sTCP:LISTEN", "-t"], stderr_to_stdout: true) do
      {"", _} ->
        :ok

      {pids, 0} ->
        pid = pids |> String.trim() |> String.split("\n", trim: true) |> hd()
        {cmd, 0} = sh.("ps", ["-o", "command=", "-p", pid], stderr_to_stdout: true)

        if String.contains?(cmd, @marker) do
          log.("[orphan_reaper] killing orphan uvicorn pid=#{pid}")
          _ = sh.("kill", ["-9", pid], stderr_to_stdout: true)
          :ok
        else
          raise "port #{@port} held by foreign process: #{String.trim(cmd)}"
        end

      _ ->
        :ok
    end
  end

  defp default_log(msg), do: IO.puts(:stderr, msg)
end
