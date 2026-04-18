defmodule Gralkor.ConfigTest do
  use ExUnit.Case, async: false

  alias Gralkor.Config

  setup do
    original =
      Enum.into(
        [
          "GRALKOR_DATA_DIR",
          "GRALKOR_SERVER_DIR",
          "GRALKOR_SERVER_URL",
          "GRALKOR_LLM_PROVIDER",
          "GRALKOR_LLM_MODEL",
          "GRALKOR_EMBEDDER_PROVIDER",
          "GRALKOR_EMBEDDER_MODEL",
          "GRALKOR_TEST"
        ],
        %{},
        fn name -> {name, System.get_env(name)} end
      )

    on_exit(fn ->
      Enum.each(original, fn
        {name, nil} -> System.delete_env(name)
        {name, value} -> System.put_env(name, value)
      end)
    end)

    Enum.each(Map.keys(original), &System.delete_env/1)
    :ok
  end

  describe "from_env/0" do
    test "reads data_dir from env" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/gralkor-test")

      cfg = Config.from_env()

      assert cfg.data_dir == "/tmp/gralkor-test"
    end

    test "expands a relative data_dir to absolute (so the Python child doesn't resolve it against its own cwd)" do
      System.put_env("GRALKOR_DATA_DIR", "tmp/gralkor-test-relative")

      cfg = Config.from_env()

      assert Path.type(cfg.data_dir) == :absolute
      assert String.ends_with?(cfg.data_dir, "tmp/gralkor-test-relative")
    end

    test "GRALKOR_TEST=true flips the test flag so the Python server emits debug logs" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")
      System.put_env("GRALKOR_TEST", "true")
      on_exit(fn -> System.delete_env("GRALKOR_TEST") end)

      assert Config.from_env().test == true
    end

    test "GRALKOR_TEST unset leaves the test flag false" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")

      refute Config.from_env().test
    end

    test "raises when GRALKOR_DATA_DIR is missing" do
      assert_raise System.EnvError, fn -> Config.from_env() end
    end

    test "leaves llm/embedder provider nil when unset (server applies defaults)" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")

      cfg = Config.from_env()

      assert cfg.llm_provider == nil
      assert cfg.embedder_provider == nil
    end

    test "defaults server_dir to the packaged priv/server and server_url to 127.0.0.1:4000" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")

      cfg = Config.from_env()

      assert cfg.server_dir == Config.default_server_dir()
      assert String.ends_with?(cfg.server_dir, "priv/server")
      assert cfg.server_url == "http://127.0.0.1:4000"
    end
  end

  describe "build_yaml/1" do
    test "top-level keys are llm and embedder when providers are set" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u",
        llm_provider: "gemini",
        embedder_provider: "gemini"
      }

      yaml = Config.build_yaml(cfg)

      assert yaml =~ ~r/^llm:/m
      assert yaml =~ ~r/^embedder:/m
    end

    test "omits model key when llm_model is nil" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u",
        llm_provider: "gemini",
        embedder_provider: "gemini"
      }

      yaml = Config.build_yaml(cfg)

      refute yaml =~ "model:"
    end

    test "emits nothing when llm and embedder providers are nil (server applies defaults)" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u"
      }

      yaml = Config.build_yaml(cfg)

      refute yaml =~ "llm:"
      refute yaml =~ "embedder:"
    end

    test "emits `test: true` when the test flag is set (enables Python-side debug logging)" do
      cfg = %Config{data_dir: "/d", server_dir: "/s", server_url: "u", test: true}
      yaml = Config.build_yaml(cfg)
      assert yaml =~ ~r/^test: true$/m
    end

    test "omits `test:` when the test flag is unset" do
      cfg = %Config{data_dir: "/d", server_dir: "/s", server_url: "u"}
      yaml = Config.build_yaml(cfg)
      refute yaml =~ "test:"
    end

    test "includes model key when llm_model is set" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u",
        llm_provider: "gemini",
        llm_model: "gemini-3.1-flash-lite-preview",
        embedder_provider: "gemini"
      }

      yaml = Config.build_yaml(cfg)

      assert yaml =~ "  model: gemini-3.1-flash-lite-preview"
    end
  end

  describe "write_yaml/1" do
    test "creates data_dir if missing and writes yaml" do
      tmp = Path.join(System.tmp_dir!(), "gralkor-cfg-#{System.unique_integer([:positive])}")
      on_exit(fn -> File.rm_rf!(tmp) end)

      cfg = %Config{
        data_dir: tmp,
        server_dir: "/s",
        server_url: "u",
        llm_provider: "gemini",
        embedder_provider: "gemini"
      }

      :ok = Config.write_yaml(cfg)

      path = Path.join(tmp, "config.yaml")
      assert File.exists?(path)
      assert File.read!(path) =~ "provider: gemini"
    end
  end
end
