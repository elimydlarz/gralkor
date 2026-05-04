defmodule Gralkor.GraphitiPool do
  @moduledoc """
  Per-group Graphiti instance cache, plus the gateway for graphiti operations.

  Holds one shared `AsyncFalkorDB` (the embedded redis-server child lives
  here) and lazily constructs one `Graphiti` instance per `group_id`. Cached
  in ETS for concurrent reads — `for/1` only hits the GenServer on a cache
  miss (i.e. the first time any caller asks for a given group). Once cached,
  thousands of callers can read the instance simultaneously without going
  through the GenServer.

  This is intentional. The spike (`pythonx-spike/LEARNINGS.md`) showed that
  Pythonx releases the GIL during graphiti's awaited I/O, so concurrent
  Elixir callers parallelise naturally. Serialising calls through a single
  GenServer would throw that away.

  See `ex-graphiti-pool` in `gralkor/TEST_TREES.md`.
  """

  use GenServer

  require Logger

  alias Gralkor.Client
  alias Gralkor.Config

  @default_table :gralkor_graphiti_instances

  # ── Public API ──────────────────────────────────────────────

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, if(name, do: [name: name], else: []))
  end

  @doc """
  Return the Graphiti instance for `group_id`, creating it on first use.

  Concurrent callers do not block each other once the instance is cached.
  Construction itself is serialised through the GenServer so two callers
  asking for the same group_id at the same time don't both construct it.
  """
  @spec for(GenServer.server(), String.t()) :: any()
  def for(server \\ __MODULE__, group_id) when is_binary(group_id) do
    sanitized = Client.sanitize_group_id(group_id)
    table = table_for(server)

    case :ets.lookup(table, sanitized) do
      [{^sanitized, instance}] -> instance
      [] -> GenServer.call(server, {:create, sanitized})
    end
  end

  @doc """
  Run graphiti's hybrid search against `group_id`. Returns
  `{:ok, [%{fact:, created_at:, valid_at:, invalid_at:, expired_at:}]}`
  ready for `Gralkor.Format.format_facts/1`.
  """
  @spec search(GenServer.server(), String.t(), String.t(), pos_integer()) ::
          {:ok, [map()]} | {:error, term()}
  def search(server \\ __MODULE__, group_id, query, max_results)
      when is_binary(group_id) and is_binary(query) and is_integer(max_results) do
    instance = __MODULE__.for(server, group_id)

    {raw, _} =
      Pythonx.eval(
        """
        import asyncio
        q = query.decode('utf-8') if isinstance(query, (bytes, bytearray)) else query
        edges = asyncio._gralkor_run(g.search(q, num_results=max_results))
        [
          {
            "fact": e.fact,
            "created_at": str(e.created_at) if e.created_at else None,
            "valid_at": str(e.valid_at) if e.valid_at else None,
            "invalid_at": str(e.invalid_at) if e.invalid_at else None,
            "expired_at": str(e.expired_at) if e.expired_at else None,
          } for e in edges
        ]
        """,
        %{"g" => instance, "query" => query, "max_results" => max_results}
      )

    {:ok, raw |> Pythonx.decode() |> Enum.map(&atomize_keys/1)}
  rescue
    e in Pythonx.Error -> {:error, {:python, Exception.message(e)}}
  end

  @doc """
  Ingest one episode (text content) into `group_id` via graphiti's
  `add_episode`. Auto-generates `name` and `idempotency_key`.
  """
  @spec add_episode(GenServer.server(), String.t(), String.t(), String.t()) ::
          :ok | {:error, term()}
  def add_episode(server \\ __MODULE__, group_id, content, source_description)
      when is_binary(group_id) and is_binary(content) and is_binary(source_description) do
    instance = __MODULE__.for(server, group_id)

    name = "manual-add-" <> Integer.to_string(System.system_time(:millisecond))
    idempotency_key = "key-" <> Integer.to_string(System.unique_integer([:positive, :monotonic]))

    sanitized = Client.sanitize_group_id(group_id)

    {_, _} =
      Pythonx.eval(
        """
        import asyncio
        from datetime import datetime, timezone
        from graphiti_core.nodes import EpisodeType
        c = content.decode('utf-8') if isinstance(content, (bytes, bytearray)) else content
        s = source.decode('utf-8') if isinstance(source, (bytes, bytearray)) else source
        n = name.decode('utf-8') if isinstance(name, (bytes, bytearray)) else name
        gid = group.decode('utf-8') if isinstance(group, (bytes, bytearray)) else group
        asyncio._gralkor_run(g.add_episode(
          name=n,
          episode_body=c,
          source=EpisodeType.text,
          source_description=s,
          group_id=gid,
          reference_time=datetime.now(timezone.utc),
        ))
        None
        """,
        %{
          "g" => instance,
          "content" => content,
          "source" => source_description,
          "name" => name,
          "group" => sanitized,
          "_idem" => idempotency_key
        }
      )

    :ok
  rescue
    e in Pythonx.Error -> {:error, {:python, Exception.message(e)}}
  end

  @doc "Build indices and constraints across the whole graph."
  @spec build_indices(GenServer.server()) :: {:ok, %{status: String.t()}} | {:error, term()}
  def build_indices(server \\ __MODULE__) do
    instance = __MODULE__.for(server, "default_db")

    {_, _} =
      Pythonx.eval(
        """
        import asyncio
        asyncio._gralkor_run(g.build_indices_and_constraints())
        None
        """,
        %{"g" => instance}
      )

    {:ok, %{status: "built"}}
  rescue
    e in Pythonx.Error -> {:error, {:python, Exception.message(e)}}
  end

  @doc "Build communities for `group_id`."
  @spec build_communities(GenServer.server(), String.t()) ::
          {:ok, %{communities: non_neg_integer(), edges: non_neg_integer()}} | {:error, term()}
  def build_communities(server \\ __MODULE__, group_id) when is_binary(group_id) do
    instance = __MODULE__.for(server, group_id)

    {raw, _} =
      Pythonx.eval(
        """
        import asyncio
        nodes, edges = asyncio._gralkor_run(g.build_communities())
        {"communities": len(nodes or []), "edges": len(edges or [])}
        """,
        %{"g" => instance}
      )

    decoded = Pythonx.decode(raw)
    {:ok, %{communities: decoded["communities"], edges: decoded["edges"]}}
  rescue
    e in Pythonx.Error -> {:error, {:python, Exception.message(e)}}
  end

  @fact_keys ~w(fact created_at valid_at invalid_at expired_at)a
  @fact_keys_strings Enum.map(@fact_keys, &Atom.to_string/1)

  defp atomize_keys(map) when is_map(map) do
    Map.new(map, fn {k, v} ->
      key = if k in @fact_keys_strings, do: String.to_atom(k), else: k
      {key, v}
    end)
  end

  # ── GenServer ──────────────────────────────────────────────

  @impl true
  def init(opts) do
    table = Keyword.get(opts, :table, @default_table)
    data_dir = Keyword.fetch!(opts, :data_dir)
    llm_model = Keyword.get(opts, :llm_model, Config.llm_model(%Config{data_dir: data_dir}))
    embedder_model = Keyword.get(opts, :embedder_model, Config.embedder_model(%Config{data_dir: data_dir}))
    interpret_fn = Keyword.get(opts, :interpret_fn)

    construct_falkor_db = Keyword.get(opts, :construct_falkor_db, &default_construct_falkor_db/1)

    construct_shared_clients =
      Keyword.get(opts, :construct_shared_clients, &default_construct_shared_clients/2)

    construct_instance = Keyword.get(opts, :construct_instance, &default_construct_instance/3)
    warmup? = Keyword.get(opts, :warmup, true)
    install_loop? = Keyword.get(opts, :install_async_runtime, true)

    :ets.new(table, [:set, :public, :named_table, read_concurrency: true])
    register_table(self(), table)

    # Idempotent — installs the shared asyncio loop if Gralkor.Python hasn't.
    # Lets GraphitiPool be used standalone (production + integration tests).
    # Unit tests with stubbed construction pass `install_async_runtime: false`
    # to avoid spinning up Pythonx.
    if install_loop?, do: :ok = Gralkor.Python.install_async_runtime()

    falkor_db = construct_falkor_db.(data_dir)
    shared = construct_shared_clients.(llm_model, embedder_model)

    state = %{
      table: table,
      falkor_db: falkor_db,
      shared: shared,
      construct_instance: construct_instance,
      interpret_fn: interpret_fn
    }

    if warmup?, do: do_warmup(state)

    {:ok, state}
  end

  @impl true
  def handle_call({:create, sanitized_group_id}, _from, state) do
    instance =
      case :ets.lookup(state.table, sanitized_group_id) do
        [{^sanitized_group_id, existing}] ->
          existing

        [] ->
          fresh = state.construct_instance.(state.falkor_db, state.shared, sanitized_group_id)
          :ets.insert(state.table, {sanitized_group_id, fresh})
          fresh
      end

    {:reply, instance, state}
  end

  @impl true
  def terminate(_reason, state) do
    unregister_table(self())
    :ets.delete(state.table)
    :ok
  end

  # ── Defaults: real Pythonx-backed construction ──────────────

  defp default_construct_falkor_db(data_dir) do
    File.mkdir_p!(data_dir)
    db_path = Path.join(data_dir, "gralkor.db")

    {db, _} =
      Pythonx.eval(
        """
        from redislite.async_falkordb_client import AsyncFalkorDB
        # Pythonx encodes Elixir binaries as Python bytes; redislite needs str.
        AsyncFalkorDB(db_path.decode('utf-8') if isinstance(db_path, (bytes, bytearray)) else db_path)
        """,
        %{"db_path" => db_path}
      )

    db
  end

  defp default_construct_instance(falkor_db, shared, sanitized_group_id) do
    {instance, _} =
      Pythonx.eval(
        """
        import asyncio
        from graphiti_core import Graphiti
        from graphiti_core.driver.falkordb_driver import FalkorDriver
        gid = group_id.decode('utf-8') if isinstance(group_id, (bytes, bytearray)) else group_id
        driver = FalkorDriver(falkor_db=falkor_db, database=gid)
        g = Graphiti(
          graph_driver=driver,
          llm_client=llm_client,
          embedder=embedder,
          cross_encoder=cross_encoder,
        )
        # Build indices on this database so the first search can find anything.
        # FalkorDB indices are per-database; CREATE INDEX is idempotent so running
        # this every time we construct a fresh instance is cheap.
        try:
            asyncio._gralkor_run(g.build_indices_and_constraints())
        except Exception as e:
            # Best-effort — surface as a warning via the return value rather than
            # crashing instance construction.
            print(f"[gralkor] build_indices_and_constraints failed (non-fatal): {e}")
        g
        """,
        %{
          "falkor_db" => falkor_db,
          "group_id" => sanitized_group_id,
          "llm_client" => Map.get(shared, :llm_client),
          "embedder" => Map.get(shared, :embedder),
          "cross_encoder" => Map.get(shared, :cross_encoder)
        }
      )

    instance
  end

  defp default_construct_shared_clients(llm_model, embedder_model) do
    {llm_provider, llm_name} = parse_model(llm_model)
    {embedder_provider, embedder_name} = parse_model(embedder_model)

    if llm_provider != "google" or embedder_provider != "google" do
      raise ArgumentError,
            "Gralkor.GraphitiPool currently only supports Google models; got llm=#{llm_model}, embedder=#{embedder_model}"
    end

    setup = """
    from google import genai
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.llm_client.gemini_client import GeminiClient
    from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
    from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient

    ln = llm_name.decode('utf-8') if isinstance(llm_name, (bytes, bytearray)) else llm_name
    en = embedder_name.decode('utf-8') if isinstance(embedder_name, (bytes, bytearray)) else embedder_name
    client = genai.Client()
    """

    args = %{"llm_name" => llm_name, "embedder_name" => embedder_name}

    {llm, _} =
      Pythonx.eval(
        setup <> "GeminiClient(config=LLMConfig(model=ln), client=client)\n",
        args
      )

    # gemini-embedding-2-preview returns ONE embedding for N inputs in a single
    # call — graphiti's batched create_batch then fails with
    # "zip() argument 2 is shorter than argument 1". Force batch_size=1 so each
    # input becomes its own request. gemini-embedding-001 batches fine but
    # we set batch_size=1 uniformly so the call shape is identical regardless
    # of model choice.
    #
    # Filed upstream as getzep/graphiti#1467 — remove this workaround once the
    # fix lands and we've bumped past the affected version.
    {embedder, _} =
      Pythonx.eval(
        setup <>
          "GeminiEmbedder(GeminiEmbedderConfig(embedding_model=en), client=client, batch_size=1)\n",
        args
      )

    {cross_encoder, _} =
      Pythonx.eval(setup <> "GeminiRerankerClient(client=client)\n", args)

    %{llm_client: llm, embedder: embedder, cross_encoder: cross_encoder}
  end

  defp parse_model(model_string) do
    case String.split(model_string, ":", parts: 2) do
      [provider, name] -> {provider, name}
      _ -> raise ArgumentError, "expected '<provider>:<model>', got #{inspect(model_string)}"
    end
  end

  defp do_warmup(state) do
    t0 = System.monotonic_time(:millisecond)
    instance = ensure_warmup_instance(state)

    {search_result, search_ms} = time(fn -> warmup_search(instance) end)
    {interpret_result, interpret_ms} = time_warmup_interpret(state)

    Logger.info(
      "[gralkor] warmup — search:#{search_ms} interpret:#{interpret_ms} #{System.monotonic_time(:millisecond) - t0}ms"
    )

    case {search_result, interpret_result} do
      {:ok, :ok} -> :ok
      {{:error, reason}, _} -> log_warmup_failure(:search, reason)
      {_, {:error, reason}} -> log_warmup_failure(:interpret, reason)
    end
  end

  defp ensure_warmup_instance(state) do
    sanitized = "warmup"

    case :ets.lookup(state.table, sanitized) do
      [{^sanitized, instance}] ->
        instance

      [] ->
        instance = state.construct_instance.(state.falkor_db, state.shared, sanitized)
        :ets.insert(state.table, {sanitized, instance})
        instance
    end
  end

  defp warmup_search(instance) do
    Pythonx.eval(
      """
      import asyncio
      asyncio._gralkor_run(g.search('warmup', num_results=1))
      """,
      %{"g" => instance}
    )

    :ok
  rescue
    e in Pythonx.Error -> {:error, Exception.message(e)}
  end

  defp time_warmup_interpret(%{interpret_fn: nil}), do: {0, :ok}

  defp time_warmup_interpret(%{interpret_fn: interpret_fn}) when is_function(interpret_fn, 1) do
    time(fn ->
      try do
        interpret_fn.("Conversation context:\n\n\nMemory facts to interpret:\n- warmup")
        :ok
      rescue
        e -> {:error, Exception.message(e)}
      end
    end)
  end

  defp time(fun) do
    t0 = System.monotonic_time(:millisecond)
    result = fun.()
    {result, System.monotonic_time(:millisecond) - t0}
  end

  defp log_warmup_failure(stage, reason) do
    Logger.warning("[gralkor] warmup failed (non-fatal) — #{stage}: #{inspect(reason)}")
    :ok
  end

  # ── Per-server table lookup ─────────────────────────────────
  # When tests start unnamed pools, the ETS table name is per-instance.
  # We map server pid → table via the process dictionary of the GenServer
  # (looked up via `:sys.get_state` is too heavy; use a tiny ETS table).

  @registry :gralkor_graphiti_pool_registry

  defp ensure_registry do
    if :ets.whereis(@registry) == :undefined do
      :ets.new(@registry, [:set, :public, :named_table])
    end

    @registry
  end

  defp register_table(pid, table) do
    ensure_registry()
    :ets.insert(@registry, {pid, table})
  end

  defp unregister_table(pid) do
    ensure_registry()
    :ets.delete(@registry, pid)
  end

  defp table_for(server) when is_atom(server) do
    @default_table
  end

  defp table_for(server) when is_pid(server) do
    ensure_registry()

    case :ets.lookup(@registry, server) do
      [{^server, table}] -> table
      [] -> @default_table
    end
  end
end
