defmodule Gralkor.ConnectionTest do
  use ExUnit.Case, async: false

  alias Gralkor.Client.InMemory
  alias Gralkor.Connection

  setup do
    previous = Application.get_env(:gralkor, :client)
    Application.put_env(:gralkor, :client, InMemory)
    start_supervised!(InMemory)

    on_exit(fn ->
      if previous,
        do: Application.put_env(:gralkor, :client, previous),
        else: Application.delete_env(:gralkor, :client)
    end)

    :ok
  end

  describe "when starting up" do
    test "Gralkor's health is polled until it responds healthy, blocking boot" do
      InMemory.set_health(:ok)

      assert {:ok, pid} = Connection.start_link(boot_window_ms: 200)

      assert length(InMemory.health_checks()) >= 1

      GenServer.stop(pid)
    end

    test "if Gralkor does not respond healthy within the boot window, startup fails" do
      InMemory.set_health({:error, :gralkor_down})

      Process.flag(:trap_exit, true)

      assert {:error, {:gralkor_unreachable, :gralkor_down}} =
               Connection.start_link(boot_window_ms: 30, boot_backoff_ms: 10)
    end
  end

  describe "after boot" do
    test "does not poll again — runtime outages surface on the next actual call" do
      InMemory.set_health(:ok)

      {:ok, pid} = Connection.start_link(boot_window_ms: 200)

      count_after_boot = length(InMemory.health_checks())
      Process.sleep(100)
      count_later = length(InMemory.health_checks())

      assert count_later == count_after_boot, "Connection should be idle after boot"

      GenServer.stop(pid)
    end
  end
end
