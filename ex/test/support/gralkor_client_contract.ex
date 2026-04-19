defmodule Gralkor.ClientContract do
  @moduledoc """
  Shared port-contract assertions for `Gralkor.Client` implementations.

  Each adapter's test file does `use Gralkor.ClientContract, client: MyClient`
  and defines a `configure_backend/2` function that makes the underlying
  storage return a given response for a given operation. The contract then
  exercises every op through the adapter and asserts the return shape.

  Both adapters — `InMemory` and `HTTP` — must pass this suite. Adapter-
  specific behaviour (fixture semantics, HTTP headers, HTTP status mapping)
  lives in the adapter's own test file alongside this shared contract.
  """

  defmacro __using__(opts) do
    client = Keyword.fetch!(opts, :client)

    quote bind_quoted: [client: client] do
      @client client

      describe "port contract: recall/3" do
        test "returns {:ok, memory_block} when the backend has memory" do
          configure_backend(:recall, {:ok, "<gralkor-memory>facts</gralkor-memory>"})
          assert {:ok, "<gralkor-memory>facts</gralkor-memory>"} = @client.recall("g1", "s1", "q")
        end

        test "returns {:ok, nil} when the backend has no memory" do
          configure_backend(:recall, {:ok, nil})
          assert {:ok, nil} = @client.recall("g1", "s1", "q")
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:recall, {:error, :boom})
          assert {:error, _} = @client.recall("g1", "s1", "q")
        end
      end

      describe "port contract: capture/3" do
        test "returns :ok when the backend acknowledges the capture" do
          configure_backend(:capture, :ok)
          turn = %{user_query: "q", assistant_answer: "a", events: []}
          assert :ok = @client.capture("s1", "g1", turn)
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:capture, {:error, :boom})
          turn = %{user_query: "q", assistant_answer: "a", events: []}
          assert {:error, _} = @client.capture("s1", "g1", turn)
        end
      end

      describe "port contract: memory_search/3" do
        test "returns {:ok, text} when the backend returns results" do
          configure_backend(:memory_search, {:ok, "Facts:\n- ..."})
          assert {:ok, "Facts:\n- ..."} = @client.memory_search("g1", "s1", "q")
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:memory_search, {:error, :boom})
          assert {:error, _} = @client.memory_search("g1", "s1", "q")
        end
      end

      describe "port contract: end_session/1" do
        test "returns :ok when the backend acknowledges the end" do
          configure_backend(:end_session, :ok)
          assert :ok = @client.end_session("s1")
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:end_session, {:error, :boom})
          assert {:error, _} = @client.end_session("s1")
        end
      end

      describe "port contract: memory_add/3" do
        test "returns :ok when the backend acknowledges the add" do
          configure_backend(:memory_add, :ok)
          assert :ok = @client.memory_add("g1", "content", "source")
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:memory_add, {:error, :boom})
          assert {:error, _} = @client.memory_add("g1", "content", nil)
        end
      end

      describe "port contract: health_check/0" do
        test "returns :ok when the backend is healthy" do
          configure_backend(:health_check, :ok)
          assert :ok = @client.health_check()
        end

        test "returns {:error, reason} when the backend fails" do
          configure_backend(:health_check, {:error, :boom})
          assert {:error, _} = @client.health_check()
        end
      end
    end
  end
end
