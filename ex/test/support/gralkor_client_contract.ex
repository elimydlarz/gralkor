defmodule Gralkor.ClientContract do
  @moduledoc """
  Shared port contract for `Gralkor.Client`.

  Both `Gralkor.Client.InMemory` and `Gralkor.Client.Native` import this and
  must pass it. Reifies the `ex-client` tree in `gralkor/TEST_TREES.md`. The
  describe/it hierarchy mirrors the tree verbatim.

  Usage from a per-adapter test file:

      use ExUnit.Case, async: false
      import Gralkor.ClientContract

      setup do
        # boot the adapter under test, return any per-test setup
      end

      run_contract(fn -> :ok end)
  """

  defmacro run_contract(do: setup_block) do
    quote do
      describe "ex-client > recall/3 with a non-blank string session_id" do
        test "when the backend returns a memory block then {:ok, block} is returned" do
          unquote(setup_block).()

          configure_recall({:ok, "<gralkor-memory>some block</gralkor-memory>"})

          assert {:ok, "<gralkor-memory>some block</gralkor-memory>"} =
                   client().recall("group-1", "session-1", "what is X?")
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_recall({:error, :backend_down})

          assert {:error, :backend_down} = client().recall("group-1", "session-1", "what?")
        end
      end

      describe "ex-client > recall/3 with a nil session_id" do
        test "when the backend returns a memory block then {:ok, block} is returned" do
          unquote(setup_block).()
          configure_recall({:ok, "<gralkor-memory>x</gralkor-memory>"})

          assert {:ok, "<gralkor-memory>x</gralkor-memory>"} =
                   client().recall("group-1", nil, "anything?")
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_recall({:error, :nope})

          assert {:error, :nope} = client().recall("group-1", nil, "q")
        end
      end

      describe "ex-client > capture/3" do
        test "when the backend acknowledges the capture then :ok is returned" do
          unquote(setup_block).()
          configure_capture(:ok)

          assert :ok =
                   client().capture("session-1", "group-1", [
                     Gralkor.Message.new("user", "hi")
                   ])
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_capture({:error, :write_failed})

          assert {:error, :write_failed} =
                   client().capture("session-1", "group-1", [Gralkor.Message.new("user", "hi")])
        end
      end

      describe "ex-client > end_session/1" do
        test "when the backend acknowledges the end then :ok is returned" do
          unquote(setup_block).()
          configure_end_session(:ok)

          assert :ok = client().end_session("session-1")
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_end_session({:error, :flush_failed})

          assert {:error, :flush_failed} = client().end_session("session-1")
        end
      end

      describe "ex-client > memory_add/3" do
        test "when the backend acknowledges the add then :ok is returned" do
          unquote(setup_block).()
          configure_memory_add(:ok)

          assert :ok = client().memory_add("group-1", "Eli prefers concise", "manual")
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_memory_add({:error, :extract_failed})

          assert {:error, :extract_failed} = client().memory_add("group-1", "x", nil)
        end
      end

      describe "ex-client > build_indices/0" do
        test "when the backend acknowledges the rebuild then {:ok, %{status: ...}} is returned" do
          unquote(setup_block).()
          configure_build_indices({:ok, %{status: "built"}})

          assert {:ok, %{status: "built"}} = client().build_indices()
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_build_indices({:error, :nope})

          assert {:error, :nope} = client().build_indices()
        end
      end

      describe "ex-client > build_communities/1" do
        test "when the backend returns counts then {:ok, %{communities: …, edges: …}} is returned" do
          unquote(setup_block).()
          configure_build_communities({:ok, %{communities: 3, edges: 7}})

          assert {:ok, %{communities: 3, edges: 7}} = client().build_communities("group-1")
        end

        test "if the backend fails then {:error, reason} is returned" do
          unquote(setup_block).()
          configure_build_communities({:error, :upstream})

          assert {:error, :upstream} = client().build_communities("group-1")
        end
      end
    end
  end
end
