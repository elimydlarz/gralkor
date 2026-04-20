defmodule Gralkor.Client.HTTPTest do
  use ExUnit.Case, async: false

  alias Gralkor.Client.HTTP

  setup do
    Req.Test.set_req_test_to_private(self())
    :ok
  end

  # ── Backend configuration for the shared port contract ───────────────

  defp configure_backend(:recall, {:ok, block}) do
    stub(fn conn ->
      body = expect_post(conn, "/recall")
      assert %{"group_id" => _, "session_id" => _, "query" => _} = body
      wire_body = if is_nil(block), do: "", else: block
      Req.Test.json(conn, %{"memory_block" => wire_body})
    end)
  end

  defp configure_backend(:recall, {:error, _reason}) do
    stub(fn conn ->
      _ = expect_post(conn, "/recall")
      Plug.Conn.send_resp(conn, 503, "")
    end)
  end

  defp configure_backend(:capture, :ok) do
    stub(fn conn ->
      body = expect_post(conn, "/capture")

      assert %{
               "session_id" => _,
               "group_id" => _,
               "turn" => %{
                 "user_query" => _,
                 "assistant_answer" => _,
                 "events" => _
               }
             } = body

      Plug.Conn.send_resp(conn, 204, "")
    end)
  end

  defp configure_backend(:capture, {:error, _}) do
    stub(fn conn ->
      _ = expect_post(conn, "/capture")
      Plug.Conn.send_resp(conn, 500, "")
    end)
  end

  defp configure_backend(:memory_search, {:ok, text}) do
    stub(fn conn ->
      body = expect_post(conn, "/tools/memory_search")
      assert %{"group_id" => _, "session_id" => _, "query" => _} = body
      Req.Test.json(conn, %{"text" => text})
    end)
  end

  defp configure_backend(:memory_search, {:error, _}) do
    stub(fn conn ->
      _ = expect_post(conn, "/tools/memory_search")
      Plug.Conn.send_resp(conn, 502, "")
    end)
  end

  defp configure_backend(:end_session, :ok) do
    stub(fn conn ->
      body = expect_post(conn, "/session_end")
      assert %{"session_id" => _} = body
      Plug.Conn.send_resp(conn, 204, "")
    end)
  end

  defp configure_backend(:end_session, {:error, _}) do
    stub(fn conn ->
      _ = expect_post(conn, "/session_end")
      Plug.Conn.send_resp(conn, 500, "")
    end)
  end

  defp configure_backend(:memory_add, :ok) do
    stub(fn conn ->
      body = expect_post(conn, "/tools/memory_add")
      assert %{"group_id" => _, "content" => _} = body
      Req.Test.json(conn, %{"status" => "stored"})
    end)
  end

  defp configure_backend(:memory_add, {:error, _}) do
    stub(fn conn ->
      _ = expect_post(conn, "/tools/memory_add")
      Plug.Conn.send_resp(conn, 500, "")
    end)
  end

  defp configure_backend(:health_check, :ok) do
    stub(fn conn ->
      assert conn.method == "GET"
      assert conn.request_path == "/health"
      Req.Test.json(conn, %{"status" => "ok"})
    end)
  end

  defp configure_backend(:health_check, {:error, _}) do
    stub(fn conn -> Plug.Conn.send_resp(conn, 503, "") end)
  end

  defp configure_backend(:build_indices, {:ok, %{status: status}}) do
    stub(fn conn ->
      assert conn.method == "POST"
      assert conn.request_path == "/build-indices"
      Req.Test.json(conn, %{"status" => status})
    end)
  end

  defp configure_backend(:build_indices, {:error, _}) do
    stub(fn conn ->
      assert conn.request_path == "/build-indices"
      Plug.Conn.send_resp(conn, 503, "")
    end)
  end

  defp configure_backend(:build_communities, {:ok, %{communities: c, edges: e}}) do
    stub(fn conn ->
      body = expect_post(conn, "/build-communities")
      assert %{"group_id" => _} = body
      Req.Test.json(conn, %{"communities" => c, "edges" => e})
    end)
  end

  defp configure_backend(:build_communities, {:error, _}) do
    stub(fn conn ->
      _ = expect_post(conn, "/build-communities")
      Plug.Conn.send_resp(conn, 503, "")
    end)
  end

  use Gralkor.ClientContract, client: HTTP

  # ── Adapter-specific behaviour ───────────────────────────────────────

  describe "every HTTP request" do
    test "carries no Authorization header" do
      parent = self()

      stub(fn conn ->
        send(parent, {:auth_header, Plug.Conn.get_req_header(conn, "authorization")})
        Req.Test.json(conn, %{"memory_block" => ""})
      end)

      {:ok, nil} = HTTP.recall("g1", "s1", "q")

      assert_receive {:auth_header, []}
    end
  end

  describe "if Gralkor responds with a non-2xx status" do
    test "{:error, {:http_status, status, body}} is returned" do
      stub(fn conn -> Plug.Conn.send_resp(conn, 418, "i'm a teapot") end)

      assert {:error, {:http_status, 418, "i'm a teapot"}} = HTTP.recall("g1", "s1", "q")
    end
  end

  describe "if the app env is missing" do
    test "the call raises" do
      previous = Application.get_env(:gralkor, :client_http)
      Application.delete_env(:gralkor, :client_http)

      try do
        assert_raise ArgumentError, fn -> HTTP.recall("g1", "s1", "q") end
      after
        Application.put_env(:gralkor, :client_http, previous)
      end
    end
  end

  describe "when capture/3 is given events containing Elixir tuples" do
    test "tuples are normalised to lists before JSON encoding (no Jason crash)" do
      parent = self()

      stub(fn conn ->
        body = expect_post(conn, "/capture")
        send(parent, {:body, body})
        Plug.Conn.send_resp(conn, 204, "")
      end)

      turn = %{
        user_query: "q",
        assistant_answer: "a",
        events: [
          %{
            kind: :tool_completed,
            data: %{
              tool_name: "memory_search",
              result: {:ok, %{result: "Facts: (none)"}}
            }
          },
          %{
            kind: :tool_completed,
            data: %{
              tool_name: "memory_add",
              result: {:error, %{reason: :timeout}}
            }
          }
        ]
      }

      assert :ok = HTTP.capture("s1", "g1", turn)

      assert_receive {:body, body}
      [first, second] = body["turn"]["events"]
      assert first["data"]["result"] == ["ok", %{"result" => "Facts: (none)"}]
      assert second["data"]["result"] == ["error", %{"reason" => "timeout"}]
    end
  end

  describe "if session_id is blank" do
    test "recall/3 raises" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.recall("g1", "", "q")
      end
    end

    test "capture/3 raises" do
      turn = %{user_query: "q", assistant_answer: "a", events: []}

      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.capture("", "g1", turn)
      end
    end

    test "memory_search/3 raises" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.memory_search("g1", "", "q")
      end
    end

    test "end_session/1 raises" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.end_session("")
      end
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────

  defp stub(fun), do: Req.Test.stub(:gralkor_stub, fun)

  defp expect_post(conn, path) do
    assert conn.method == "POST"
    assert conn.request_path == path
    {:ok, raw, _conn} = Plug.Conn.read_body(conn)
    Jason.decode!(raw)
  end
end
