defmodule Gralkor.ConfigTest do
  use ExUnit.Case, async: false

  alias Gralkor.Config

  setup do
    original_data_dir = System.get_env("GRALKOR_DATA_DIR")
    original_llm = System.get_env("GRALKOR_LLM_MODEL")
    original_embedder = System.get_env("GRALKOR_EMBEDDER_MODEL")
    original_falkordb = Application.get_env(:gralkor_ex, :falkordb)

    on_exit(fn ->
      restore_env("GRALKOR_DATA_DIR", original_data_dir)
      restore_env("GRALKOR_LLM_MODEL", original_llm)
      restore_env("GRALKOR_EMBEDDER_MODEL", original_embedder)

      case original_falkordb do
        nil -> Application.delete_env(:gralkor_ex, :falkordb)
        v -> Application.put_env(:gralkor_ex, :falkordb, v)
      end
    end)

    System.delete_env("GRALKOR_DATA_DIR")
    System.delete_env("GRALKOR_LLM_MODEL")
    System.delete_env("GRALKOR_EMBEDDER_MODEL")
    Application.delete_env(:gralkor_ex, :falkordb)
    :ok
  end

  defp restore_env(_key, nil), do: :ok
  defp restore_env(key, ""), do: System.put_env(key, "")
  defp restore_env(key, v), do: System.put_env(key, v)

  describe "falkordb-connection > when neither :falkordb nor GRALKOR_DATA_DIR is set" do
    test "returns nil" do
      assert Config.falkordb_spec() == nil
    end
  end

  describe "falkordb-connection > when GRALKOR_DATA_DIR is set and :falkordb is unset" do
    test "returns {:embedded, expanded_path}" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/gralkor")
      assert Config.falkordb_spec() == {:embedded, "/tmp/gralkor"}
    end

    test "expands ~ in the data dir" do
      System.put_env("GRALKOR_DATA_DIR", "~/gralkor")
      assert {:embedded, expanded} = Config.falkordb_spec()
      refute String.starts_with?(expanded, "~")
    end
  end

  describe "falkordb-connection > when :falkordb is set with :host and :port" do
    test "returns {:remote, kw} with the keyword list unchanged" do
      Application.put_env(:gralkor_ex, :falkordb, host: "falkor.example", port: 6379)
      assert Config.falkordb_spec() == {:remote, [host: "falkor.example", port: 6379]}
    end

    test "remote wins when GRALKOR_DATA_DIR is also set" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/should_be_ignored")
      Application.put_env(:gralkor_ex, :falkordb, host: "falkor.example", port: 6379)
      assert {:remote, _} = Config.falkordb_spec()
    end

    test "carries username and password through" do
      Application.put_env(:gralkor_ex, :falkordb,
        host: "falkor.example",
        port: 6379,
        username: "alice",
        password: "secret"
      )

      assert {:remote, kw} = Config.falkordb_spec()
      assert Keyword.fetch!(kw, :username) == "alice"
      assert Keyword.fetch!(kw, :password) == "secret"
    end
  end

  describe "falkordb-connection > when :falkordb is misconfigured" do
    test "raises when :host is missing" do
      Application.put_env(:gralkor_ex, :falkordb, port: 6379)
      assert_raise ArgumentError, ~r/:host/, fn -> Config.falkordb_spec() end
    end

    test "raises when :port is missing" do
      Application.put_env(:gralkor_ex, :falkordb, host: "falkor.example")
      assert_raise ArgumentError, ~r/:port/, fn -> Config.falkordb_spec() end
    end

    test "raises when :host is blank" do
      Application.put_env(:gralkor_ex, :falkordb, host: "", port: 6379)
      assert_raise ArgumentError, ~r/:host/, fn -> Config.falkordb_spec() end
    end

    test "raises when :port is not a positive integer" do
      Application.put_env(:gralkor_ex, :falkordb, host: "h", port: 0)
      assert_raise ArgumentError, ~r/:port/, fn -> Config.falkordb_spec() end
    end

    test "raises when :falkordb is not a keyword list" do
      Application.put_env(:gralkor_ex, :falkordb, "falkor://host:6379")
      assert_raise ArgumentError, ~r/keyword list/, fn -> Config.falkordb_spec() end
    end
  end

  describe "falkordb-connection > llm_model and embedder_model" do
    test "default to the canonical google models when env is unset" do
      assert Config.llm_model() == "google:gemini-3.1-flash-lite"
      assert Config.embedder_model() == "google:gemini-embedding-2-preview"
    end

    test "GRALKOR_LLM_MODEL overrides the default" do
      System.put_env("GRALKOR_LLM_MODEL", "openai:gpt-4")
      assert Config.llm_model() == "openai:gpt-4"
    end

    test "GRALKOR_EMBEDDER_MODEL overrides the default" do
      System.put_env("GRALKOR_EMBEDDER_MODEL", "openai:text-embedding-3-small")
      assert Config.embedder_model() == "openai:text-embedding-3-small"
    end

    test "blank env values fall back to defaults" do
      System.put_env("GRALKOR_LLM_MODEL", "")
      assert Config.llm_model() == "google:gemini-3.1-flash-lite"
    end
  end
end
