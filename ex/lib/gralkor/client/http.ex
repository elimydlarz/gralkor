defmodule Gralkor.Client.HTTP do
  @moduledoc """
  Real `Gralkor.Client` implementation over HTTP using `Req`.

  Reads config from `Application.get_env(:gralkor_ex, :client_http)`:

    * `:url` — required. Base URL of the Gralkor server (e.g.
      `"http://127.0.0.1:4000"`).
    * `:plug` — optional `Req.Test` plug tuple for stubbing in tests.
      Unset in production so Req hits the network directly.

  No auth: Gralkor is expected to run under the consumer app's
  supervision tree, bound to loopback. The consumer owns the trust
  boundary.

  Per-endpoint `receive_timeout`s, calibrated to the workload. 429 retry
  ownership for Vertex-upstream rate-limits lives inside `/recall` on
  the server — see `gralkor/TEST_TREES.md > Retry ownership`. No layer
  above the server retries this class. Under sustained Vertex throttling
  `/recall` returns 429 (for exhausted retries) or 504 (for deadline);
  the consumer's `jido_gralkor` plugin then degrades gracefully to a
  memory-less turn.

    * `/health` (2 s) — cheap liveness check; tight so `Gralkor.Connection`
      doesn't flap when the server is under LLM load.
    * `/recall` (12 s) — matches the server's `/recall` deadline. The
      server body runs graph search (`graphiti.search()` — RRF, edges
      only, calls the embedder) plus `interpret_facts`, with one 429
      retry absorbed internally inside the 12 s budget. Tight — a
      server-side 504 may race the transport; revisit if it bites.
    * `/tools/memory_search` (30 s) — *slow* graph search
      (`graphiti.search_()` with `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`
      — cross-encoder reranking + BFS) plus `interpret_facts`. More
      upstream work per call than `/recall`; sized a few seconds higher.
    * `/capture` (5 s) — server returns 204 immediately after buffering.
      No synchronous LLM call here; the flush runs in the server-side
      capture buffer (its own retry schedule).
    * `/session_end` (5 s) — server returns 204 immediately after
      scheduling the flush.
    * `/tools/memory_add` (60 s) — Graphiti entity/edge extraction is
      slow; only reached from a background `Task` in the consumer, so
      the agent never waits.
    * `/build-indices`, `/build-communities` (`:infinity`) — admin
      operations that scan the whole graph; can run for minutes to
      hours on a populated database. The operator invokes them
      explicitly, so blocking the caller is fine.

  Returns `{:error, reason}` on non-2xx or transport failure; raises on
  missing config or blank session_id. Callers let those surface.
  """

  @behaviour Gralkor.Client

  @health_timeout_ms 2_000
  @capture_timeout_ms 5_000
  @end_session_timeout_ms 5_000
  @recall_timeout_ms 12_000
  @tool_search_timeout_ms 30_000
  @memory_add_timeout_ms 60_000


  @impl true
  def recall(group_id, session_id, query) do
    body = %{group_id: group_id, query: query}
    body = if is_binary(session_id), do: Map.put(body, :session_id, session_id), else: body

    post("/recall", body, @recall_timeout_ms)
    |> case do
      {:ok, %{"memory_block" => ""}} -> {:ok, nil}
      {:ok, %{"memory_block" => block}} -> {:ok, block}
      {:ok, body} -> {:error, {:unexpected_body, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def capture(session_id, group_id, messages) when is_list(messages) do
    require_session_id!(session_id)

    post(
      "/capture",
      %{
        session_id: session_id,
        group_id: group_id,
        messages: Enum.map(messages, &message_to_json/1)
      },
      @capture_timeout_ms
    )
    |> case do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp message_to_json(%Gralkor.Message{role: role, content: content}) do
    %{role: role, content: content}
  end

  @impl true
  def memory_search(group_id, session_id, query) do
    require_session_id!(session_id)

    post(
      "/tools/memory_search",
      %{group_id: group_id, session_id: session_id, query: query},
      @tool_search_timeout_ms
    )
    |> case do
      {:ok, %{"text" => text}} -> {:ok, text}
      {:ok, body} -> {:error, {:unexpected_body, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def end_session(session_id) do
    require_session_id!(session_id)

    case post("/session_end", %{session_id: session_id}, @end_session_timeout_ms) do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def memory_add(group_id, content, source_description) do
    body = %{group_id: group_id, content: content}

    body =
      if is_binary(source_description),
        do: Map.put(body, :source_description, source_description),
        else: body

    case post("/tools/memory_add", body, @memory_add_timeout_ms) do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def health_check do
    {url, req_opts} = req_options(@health_timeout_ms)

    case Req.get(url <> "/health", req_opts) |> handle_response() do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def build_indices do
    case post("/build-indices", %{}, :infinity) do
      {:ok, %{"status" => status}} when is_binary(status) -> {:ok, %{status: status}}
      {:ok, body} -> {:error, {:unexpected_body, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def build_communities(group_id) when is_binary(group_id) do
    case post("/build-communities", %{group_id: group_id}, :infinity) do
      {:ok, %{"communities" => c, "edges" => e}} when is_integer(c) and is_integer(e) ->
        {:ok, %{communities: c, edges: e}}

      {:ok, body} ->
        {:error, {:unexpected_body, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp require_session_id!(id) when is_binary(id) and id != "", do: :ok
  defp require_session_id!(_), do: raise(ArgumentError, "session_id must be a non-blank string")

  defp post(path, body, timeout_ms) do
    {url, req_opts} = req_options(timeout_ms)
    opts = [json: body] ++ req_opts

    Req.post(url <> path, opts) |> handle_response()
  end

  defp req_options(timeout_ms) do
    config = Application.fetch_env!(:gralkor_ex, :client_http)
    url = Keyword.fetch!(config, :url)

    req_opts =
      [
        receive_timeout: timeout_ms,
        retry: false
      ]
      |> maybe_put(:plug, Keyword.get(config, :plug))

    {url, req_opts}
  end

  defp maybe_put(opts, _key, nil), do: opts
  defp maybe_put(opts, key, value), do: Keyword.put(opts, key, value)

  defp handle_response({:ok, %Req.Response{status: status, body: body}}) when status in 200..299,
    do: {:ok, body}

  defp handle_response({:ok, %Req.Response{status: status, body: body}}),
    do: {:error, {:http_status, status, body}}

  defp handle_response({:error, reason}), do: {:error, reason}
end
