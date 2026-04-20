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

  Per-endpoint `receive_timeout`s, calibrated to the workload:

    * `/health` (2 s) — cheap liveness check; tight so `Gralkor.Connection`
      doesn't flap when the server is under LLM load.
    * `/recall` (5 s) — fast graph search (`graphiti.search()` — RRF,
      edges only) plus one small LLM interpretation call. Typical ~1–2 s;
      5 s means something's actually wrong.
    * `/tools/memory_search` (10 s) — *slow* graph search
      (`graphiti.search_()` with `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`
      — cross-encoder reranking + BFS, facts + entity summaries) plus
      LLM interpretation. The cross-encoder dominates; 5 s drops
      legitimate results and the LLM hallucinates "no memory found".
      10 s is the working ceiling.
    * `/capture` (5 s) — server returns 204 immediately after buffering.
    * `/session_end` (5 s) — server returns 204 immediately after
      scheduling the flush.
    * `/tools/memory_add` (60 s) — Graphiti entity/edge extraction is
      slow; only reached from a background `Task` in the consumer, so
      the agent never waits.

  Returns `{:error, reason}` on non-2xx or transport failure; raises on
  missing config or blank session_id. Callers let those surface.
  """

  @behaviour Gralkor.Client

  @health_timeout_ms 2_000
  @capture_timeout_ms 5_000
  @end_session_timeout_ms 5_000
  @recall_timeout_ms 5_000
  @tool_search_timeout_ms 10_000
  @memory_add_timeout_ms 60_000
  @build_indices_timeout_ms 60_000
  @build_communities_timeout_ms 120_000

  @impl true
  def recall(group_id, session_id, query) do
    require_session_id!(session_id)

    post(
      "/recall",
      %{group_id: group_id, session_id: session_id, query: query},
      @recall_timeout_ms
    )
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
    case post("/build-indices", %{}, @build_indices_timeout_ms) do
      {:ok, %{"status" => status}} when is_binary(status) -> {:ok, %{status: status}}
      {:ok, body} -> {:error, {:unexpected_body, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def build_communities(group_id) when is_binary(group_id) do
    case post("/build-communities", %{group_id: group_id}, @build_communities_timeout_ms) do
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
      [receive_timeout: timeout_ms, retry: false]
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
