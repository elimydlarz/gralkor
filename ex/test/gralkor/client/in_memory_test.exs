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

  use Gralkor.ClientContract, client: InMemory

  describe "when an operation is called" do
    test "the call is recorded with its arguments for later inspection" do
      InMemory.set_recall({:ok, nil})
      InMemory.set_capture(:ok)
      InMemory.set_memory_search({:ok, "s"})
      InMemory.set_memory_add(:ok)
      InMemory.set_end_session(:ok)
      InMemory.set_health(:ok)

      _ = InMemory.recall("g1", "s1", "q")
      _ = InMemory.capture("s1", "g1", %{user_query: "q", assistant_answer: "a", events: []})
      _ = InMemory.memory_search("g1", "s1", "q")
      _ = InMemory.memory_add("g1", "content", "source")
      _ = InMemory.end_session("s1")
      _ = InMemory.health_check()

      assert InMemory.recalls() == [["g1", "s1", "q"]]

      assert InMemory.captures() == [
               ["s1", "g1", %{user_query: "q", assistant_answer: "a", events: []}]
             ]

      assert InMemory.searches() == [["g1", "s1", "q"]]
      assert InMemory.adds() == [["g1", "content", "source"]]
      assert InMemory.end_sessions() == [["s1"]]
      assert InMemory.health_checks() == [[]]
    end
  end

  describe "if no response is configured for an operation" do
    test "returns {:error, :not_configured}" do
      assert {:error, :not_configured} = InMemory.recall("g1", "s1", "q")

      assert {:error, :not_configured} =
               InMemory.capture("s1", "g1", %{user_query: "q", assistant_answer: "a", events: []})

      assert {:error, :not_configured} = InMemory.memory_search("g1", "s1", "q")
      assert {:error, :not_configured} = InMemory.memory_add("g1", "c", nil)
      assert {:error, :not_configured} = InMemory.end_session("s1")
      assert {:error, :not_configured} = InMemory.health_check()
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
