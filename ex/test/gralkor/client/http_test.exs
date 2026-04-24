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
      assert %{"group_id" => _, "query" => _} = body
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
               "messages" => messages
             } = body

      assert is_list(messages)

      for msg <- messages do
        assert %{"role" => role, "content" => content} = msg
        assert role in ["user", "assistant", "behaviour"]
        assert is_binary(content)
      end

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
      previous = Application.get_env(:gralkor_ex, :client_http)
      Application.delete_env(:gralkor_ex, :client_http)

      try do
        assert_raise ArgumentError, fn -> HTTP.recall("g1", "s1", "q") end
      after
        Application.put_env(:gralkor_ex, :client_http, previous)
      end
    end
  end

  describe "when recall is called with a non-blank string session_id" do
    test "the session_id field is included in the HTTP body" do
      parent = self()

      stub(fn conn ->
        body = expect_post(conn, "/recall")
        send(parent, {:body, body})
        Req.Test.json(conn, %{"memory_block" => ""})
      end)

      assert {:ok, nil} = HTTP.recall("g1", "s1", "q")

      assert_receive {:body, body}
      assert body["session_id"] == "s1"
    end
  end

  describe "when recall is called with a nil session_id" do
    test "the session_id field is omitted from the HTTP body" do
      parent = self()

      stub(fn conn ->
        body = expect_post(conn, "/recall")
        send(parent, {:body, body})
        Req.Test.json(conn, %{"memory_block" => ""})
      end)

      assert {:ok, nil} = HTTP.recall("g1", nil, "q")

      assert_receive {:body, body}
      refute Map.has_key?(body, "session_id")
    end
  end

  describe "capture/3 wire shape" do
    test "serialises Gralkor.Message structs to {role, content} JSON" do
      parent = self()

      stub(fn conn ->
        body = expect_post(conn, "/capture")
        send(parent, {:body, body})
        Plug.Conn.send_resp(conn, 204, "")
      end)

      messages = [
        Gralkor.Message.new("user", "hello"),
        Gralkor.Message.new("behaviour", "thought: considering"),
        Gralkor.Message.new("assistant", "hi!")
      ]

      assert :ok = HTTP.capture("s1", "g1", messages)

      assert_receive {:body, body}

      assert body["messages"] == [
               %{"role" => "user", "content" => "hello"},
               %{"role" => "behaviour", "content" => "thought: considering"},
               %{"role" => "assistant", "content" => "hi!"}
             ]
    end
  end

  describe "when the transport fails with a connection-level error, then the call is retried exactly once, when the retry succeeds" do
    test "the response is returned normally" do
      parent = self()

      Req.Test.expect(:gralkor_stub, fn conn ->
        send(parent, :stub_called)
        Req.Test.transport_error(conn, :closed)
      end)

      Req.Test.expect(:gralkor_stub, fn conn ->
        send(parent, :stub_called)
        Req.Test.json(conn, %{"memory_block" => ""})
      end)

      assert {:ok, nil} = HTTP.recall("g1", "s1", "q")

      assert_received :stub_called
      assert_received :stub_called
      refute_received :stub_called
    end
  end

  describe "when the transport fails with a connection-level error, then the call is retried exactly once, when the retry also fails" do
    test "the failure surfaces to the caller" do
      parent = self()

      Req.Test.expect(:gralkor_stub, 2, fn conn ->
        send(parent, :stub_called)
        Req.Test.transport_error(conn, :timeout)
      end)

      assert {:error, %Req.TransportError{reason: :timeout}} = HTTP.recall("g1", "s1", "q")

      assert_received :stub_called
      assert_received :stub_called
      refute_received :stub_called
    end
  end

  describe "when the server returns a non-2xx HTTP response (including 429)" do
    test "no retry is attempted — the response surfaces immediately" do
      parent = self()

      Req.Test.expect(:gralkor_stub, fn conn ->
        send(parent, :stub_called)
        Plug.Conn.send_resp(conn, 503, "")
      end)

      assert {:error, {:http_status, 503, _}} = HTTP.recall("g1", "s1", "q")

      assert_received :stub_called
      refute_received :stub_called
    end

    # The google-genai SDK owns Vertex-upstream retries (see
    # gralkor/TEST_TREES.md > Retry ownership). A 429 that reaches this
    # layer means the SDK has already exhausted its retries; retrying
    # here would only amplify load. 429 surfaces like any other non-2xx.
    test "429 surfaces without retry — the SDK at L6.5 owns Vertex-upstream retries" do
      parent = self()

      Req.Test.expect(:gralkor_stub, fn conn ->
        send(parent, :stub_called)

        conn
        |> Plug.Conn.put_resp_header("retry-after", "0")
        |> Plug.Conn.put_resp_content_type("application/json")
        |> Plug.Conn.send_resp(429, Jason.encode!(%{"detail" => "rate limited"}))
      end)

      assert {:error, {:http_status, 429, %{"detail" => "rate limited"}}} =
               HTTP.recall("g1", "s1", "q")

      assert_received :stub_called
      refute_received :stub_called
    end
  end

  describe "if the transport fails with any other error" do
    test "no retry is attempted — the failure surfaces immediately (fail-fast default)" do
      parent = self()

      Req.Test.expect(:gralkor_stub, fn conn ->
        send(parent, :stub_called)
        Req.Test.transport_error(conn, :econnrefused)
      end)

      assert {:error, %Req.TransportError{reason: :econnrefused}} = HTTP.recall("g1", "s1", "q")

      assert_received :stub_called
      refute_received :stub_called
    end
  end

  describe "if capture is called with a blank string session_id" do
    test "the call raises with ArgumentError" do
      messages = [Gralkor.Message.new("user", "q"), Gralkor.Message.new("assistant", "a")]

      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.capture("", "g1", messages)
      end
    end
  end

  describe "if capture is called with a nil session_id" do
    test "the call raises with ArgumentError" do
      messages = [Gralkor.Message.new("user", "q"), Gralkor.Message.new("assistant", "a")]

      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.capture(nil, "g1", messages)
      end
    end
  end

  describe "if memory_search is called with a blank string session_id" do
    test "the call raises with ArgumentError" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.memory_search("g1", "", "q")
      end
    end
  end

  describe "if memory_search is called with a nil session_id" do
    test "the call raises with ArgumentError" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.memory_search("g1", nil, "q")
      end
    end
  end

  describe "if end_session is called with a blank string session_id" do
    test "the call raises with ArgumentError" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.end_session("")
      end
    end
  end

  describe "if end_session is called with a nil session_id" do
    test "the call raises with ArgumentError" do
      assert_raise ArgumentError, ~r/session_id must be a non-blank string/, fn ->
        HTTP.end_session(nil)
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
