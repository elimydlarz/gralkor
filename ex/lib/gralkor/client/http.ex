defmodule Gralkor.Client.HTTP do
  @moduledoc """
  Real `Gralkor.Client` implementation over HTTP using `Req`.

  Reads config from `Application.get_env(:gralkor, :client_http)`:

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

  Outgoing JSON bodies are normalised before encoding — in particular,
  Elixir tuples are converted to lists. ReAct strategy event traces
  (shipped in `/capture`) contain `{:ok, _}` / `{:error, _}` tool
  results that Jason cannot encode natively; without normalisation
  every capture would raise.

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
  def capture(session_id, group_id, turn) do
    require_session_id!(session_id)

    post(
      "/capture",
      %{
        session_id: session_id,
        group_id: group_id,
        turn: %{
          user_query: turn.user_query,
          assistant_answer: turn.assistant_answer,
          events: turn.events
        }
      },
      @capture_timeout_ms
    )
    |> case do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
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

  defp require_session_id!(id) when is_binary(id) and id != "", do: :ok
  defp require_session_id!(_), do: raise(ArgumentError, "session_id must be a non-blank string")

  defp post(path, body, timeout_ms) do
    {url, req_opts} = req_options(timeout_ms)
    opts = [json: normalize_for_json(body)] ++ req_opts

    Req.post(url <> path, opts) |> handle_response()
  end

  defp normalize_for_json(term) when is_binary(term) or is_number(term) or is_boolean(term), do: term
  defp normalize_for_json(term) when is_atom(term), do: term
  defp normalize_for_json(nil), do: nil
  defp normalize_for_json(list) when is_list(list), do: Enum.map(list, &normalize_for_json/1)

  defp normalize_for_json(tuple) when is_tuple(tuple) do
    tuple |> Tuple.to_list() |> Enum.map(&normalize_for_json/1)
  end

  defp normalize_for_json(%_{} = struct), do: struct |> Map.from_struct() |> normalize_for_json()

  defp normalize_for_json(map) when is_map(map) do
    Map.new(map, fn {k, v} -> {normalize_for_json(k), normalize_for_json(v)} end)
  end

  defp normalize_for_json(other), do: inspect(other)

  defp req_options(timeout_ms) do
    config = Application.fetch_env!(:gralkor, :client_http)
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
