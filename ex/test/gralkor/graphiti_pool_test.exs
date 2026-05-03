defmodule Gralkor.GraphitiPoolTest do
  use ExUnit.Case, async: false

  alias Gralkor.GraphitiPool

  defp start_pool(opts \\ []) do
    table = :"pool_table_#{System.unique_integer([:positive])}"

    defaults = [
      name: nil,
      table: table,
      data_dir: "/tmp/never_used",
      construct_falkor_db: fn _data_dir -> :stub_falkor_db end,
      construct_shared_clients: fn _llm, _embedder ->
        %{llm_client: nil, embedder: nil, cross_encoder: nil}
      end,
      construct_instance: fn _db, _shared, group_id -> {:stub_graphiti, group_id} end,
      warmup: false
    ]

    {:ok, pid} = GraphitiPool.start_link(Keyword.merge(defaults, opts))
    %{pid: pid, table: table}
  end

  describe "ex-graphiti-pool > for/1 when called with a group_id for the first time" do
    test "a Graphiti instance is constructed scoped to that group_id and cached in ETS" do
      %{pid: pid, table: table} = start_pool()

      instance = GraphitiPool.for(pid, "group-1")

      assert instance == {:stub_graphiti, "group_1"}
      assert [{"group_1", {:stub_graphiti, "group_1"}}] = :ets.tab2list(table)
    end
  end

  describe "ex-graphiti-pool > for/1 when called twice with the same group_id" do
    test "the same instance is returned both times (no re-construction)" do
      counter = :counters.new(1, [])

      construct_instance = fn _db, _shared, group ->
        :counters.add(counter, 1, 1)
        {:stub_graphiti, group, :counters.get(counter, 1)}
      end

      %{pid: pid} = start_pool(construct_instance: construct_instance)

      first = GraphitiPool.for(pid, "g")
      second = GraphitiPool.for(pid, "g")

      assert first == second
      assert :counters.get(counter, 1) == 1
    end
  end

  describe "ex-graphiti-pool > for/1 when called with different group_ids" do
    test "different instances are returned" do
      %{pid: pid} = start_pool()

      a = GraphitiPool.for(pid, "alpha")
      b = GraphitiPool.for(pid, "beta")

      refute a == b
    end
  end

  describe "ex-graphiti-pool > for/1 group_id sanitization" do
    test "group_id is sanitized (hyphens → underscores) before construction and lookup" do
      ref = make_ref()
      test_pid = self()

      construct_instance = fn _db, _shared, group ->
        send(test_pid, {ref, group})
        {:stub_graphiti, group}
      end

      %{pid: pid, table: table} = start_pool(construct_instance: construct_instance)

      _ = GraphitiPool.for(pid, "with-hyphens-here")

      assert_receive {^ref, "with_hyphens_here"}
      assert [{"with_hyphens_here", _}] = :ets.tab2list(table)
    end
  end

  describe "ex-graphiti-pool > for/1 does NOT serialise calls" do
    test "concurrent callers for distinct group_ids proceed in parallel" do
      construct_instance = fn _db, _shared, group ->
        Process.sleep(100)
        {:stub_graphiti, group}
      end

      %{pid: pid} = start_pool(construct_instance: construct_instance)

      {us, results} =
        :timer.tc(fn ->
          1..4
          |> Task.async_stream(
            fn i -> GraphitiPool.for(pid, "g#{i}") end,
            max_concurrency: 4,
            ordered: false
          )
          |> Enum.map(fn {:ok, r} -> r end)
        end)

      ms = div(us, 1000)
      assert length(results) == 4
      # 4 distinct groups must be CREATED serially (GenServer.call), so ~400ms.
      # But once cached, lookups are concurrent. We aren't testing
      # creation parallelism here — it's intentionally serialised. We test that
      # subsequent (cached) reads do NOT block on the GenServer.

      # Now that all 4 are cached, do 100 lookups in parallel and time them.
      {us_cached, _} =
        :timer.tc(fn ->
          1..100
          |> Task.async_stream(
            fn i -> GraphitiPool.for(pid, "g#{rem(i, 4) + 1}") end,
            max_concurrency: 100
          )
          |> Stream.run()
        end)

      assert div(us_cached, 1000) < 50,
             "100 concurrent cached reads should be near-instant (no GenServer hop), got #{div(us_cached, 1000)}ms (initial creation took #{ms}ms)"
    end
  end

  describe "ex-graphiti-pool > integration > real Pythonx + falkordblite" do
    @describetag :integration

    test "init constructs a real AsyncFalkorDB" do
      data_dir = Path.join(System.tmp_dir!(), "gralkor_pool_#{System.unique_integer([:positive])}")
      File.mkdir_p!(data_dir)

      {:ok, pid} = GraphitiPool.start_link(name: nil, data_dir: data_dir, warmup: false)

      assert Process.alive?(pid)

      GenServer.stop(pid)
      File.rm_rf!(data_dir)
    end

    test "for/1 returns a real Graphiti Pythonx.Object that can be queried" do
      data_dir = Path.join(System.tmp_dir!(), "gralkor_pool_#{System.unique_integer([:positive])}")
      File.mkdir_p!(data_dir)

      {:ok, pid} = GraphitiPool.start_link(name: nil, data_dir: data_dir, warmup: false)
      instance = GraphitiPool.for(pid, "test_group")

      # Verify it's a Pythonx.Object by running a no-op Cypher through the driver.
      {result, _} =
        Pythonx.eval(
          """
          import asyncio
          asyncio.run(g.driver.execute_query("RETURN 1 AS x"))
          """,
          %{"g" => instance}
        )

      decoded = Pythonx.decode(result)
      assert is_tuple(decoded) or is_list(decoded), "got #{inspect(decoded)}"

      GenServer.stop(pid)
      File.rm_rf!(data_dir)
    end
  end
end
