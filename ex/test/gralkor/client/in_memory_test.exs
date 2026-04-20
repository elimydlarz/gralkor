defmodule Gralkor.Client.InMemoryTest do
  use ExUnit.Case, async: false

  alias Gralkor.Client.InMemory

  setup do
    start_supervised!(InMemory)
    :ok
  end

  defp configure_backend(:recall, resp), do: InMemory.set_recall(resp)
  defp configure_backend(:capture, resp), do: InMemory.set_capture(resp)
  defp configure_backend(:memory_search, resp), do: InMemory.set_memory_search(resp)
  defp configure_backend(:memory_add, resp), do: InMemory.set_memory_add(resp)
  defp configure_backend(:end_session, resp), do: InMemory.set_end_session(resp)
  defp configure_backend(:health_check, resp), do: InMemory.set_health(resp)
  defp configure_backend(:build_indices, resp), do: InMemory.set_build_indices(resp)
  defp configure_backend(:build_communities, resp), do: InMemory.set_build_communities(resp)

  use Gralkor.ClientContract, client: InMemory

  describe "when an operation is called" do
    test "the call is recorded with its arguments for later inspection" do
      InMemory.set_recall({:ok, nil})
      InMemory.set_capture(:ok)
      InMemory.set_memory_search({:ok, "s"})
      InMemory.set_memory_add(:ok)
      InMemory.set_end_session(:ok)
      InMemory.set_health(:ok)
      InMemory.set_build_indices({:ok, %{status: "stored"}})
      InMemory.set_build_communities({:ok, %{communities: 2, edges: 5}})

      messages = [Gralkor.Message.new("user", "q"), Gralkor.Message.new("assistant", "a")]

      _ = InMemory.recall("g1", "s1", "q")
      _ = InMemory.capture("s1", "g1", messages)
      _ = InMemory.memory_search("g1", "s1", "q")
      _ = InMemory.memory_add("g1", "content", "source")
      _ = InMemory.end_session("s1")
      _ = InMemory.health_check()
      _ = InMemory.build_indices()
      _ = InMemory.build_communities("g1")

      assert InMemory.recalls() == [["g1", "s1", "q"]]
      assert InMemory.captures() == [["s1", "g1", messages]]

      assert InMemory.searches() == [["g1", "s1", "q"]]
      assert InMemory.adds() == [["g1", "content", "source"]]
      assert InMemory.end_sessions() == [["s1"]]
      assert InMemory.health_checks() == [[]]
      assert InMemory.indices_builds() == [[]]
      assert InMemory.communities_builds() == [["g1"]]
    end
  end

  describe "if no response is configured for an operation" do
    test "returns {:error, :not_configured}" do
      assert {:error, :not_configured} = InMemory.recall("g1", "s1", "q")

      assert {:error, :not_configured} =
               InMemory.capture("s1", "g1", [Gralkor.Message.new("user", "q")])

      assert {:error, :not_configured} = InMemory.memory_search("g1", "s1", "q")
      assert {:error, :not_configured} = InMemory.memory_add("g1", "c", nil)
      assert {:error, :not_configured} = InMemory.end_session("s1")
      assert {:error, :not_configured} = InMemory.health_check()
      assert {:error, :not_configured} = InMemory.build_indices()
      assert {:error, :not_configured} = InMemory.build_communities("g1")
    end
  end

  describe "when reset/0 is called" do
    test "configured responses and recorded calls are cleared" do
      InMemory.set_recall({:ok, "block"})
      _ = InMemory.recall("g1", "s1", "q")
      assert InMemory.recalls() == [["g1", "s1", "q"]]

      InMemory.reset()

      assert InMemory.recalls() == []
      assert {:error, :not_configured} = InMemory.recall("g1", "s1", "q")
    end
  end
end
