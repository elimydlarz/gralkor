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
          "GRALKOR_AUTH_TOKEN",
          "GRALKOR_LLM_PROVIDER",
          "GRALKOR_LLM_MODEL",
          "GRALKOR_EMBEDDER_PROVIDER",
          "GRALKOR_EMBEDDER_MODEL"
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
    test "reads data_dir and auth_token from env" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/gralkor-test")
      System.put_env("GRALKOR_AUTH_TOKEN", "tok")

      cfg = Config.from_env()

      assert cfg.data_dir == "/tmp/gralkor-test"
      assert cfg.auth_token == "tok"
    end

    test "raises when GRALKOR_DATA_DIR is missing" do
      System.put_env("GRALKOR_AUTH_TOKEN", "tok")
      assert_raise System.EnvError, fn -> Config.from_env() end
    end

    test "raises when GRALKOR_AUTH_TOKEN is missing" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")
      assert_raise System.EnvError, fn -> Config.from_env() end
    end

    test "leaves llm/embedder provider nil when unset (server applies defaults)" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")
      System.put_env("GRALKOR_AUTH_TOKEN", "tok")

      cfg = Config.from_env()

      assert cfg.llm_provider == nil
      assert cfg.embedder_provider == nil
    end

    test "defaults server_dir to /app/server and server_url to 127.0.0.1:4000" do
      System.put_env("GRALKOR_DATA_DIR", "/tmp/x")
      System.put_env("GRALKOR_AUTH_TOKEN", "tok")

      cfg = Config.from_env()

      assert cfg.server_dir == "/app/server"
      assert cfg.server_url == "http://127.0.0.1:4000"
    end
  end

  describe "build_yaml/1" do
    test "top-level keys are llm and embedder" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u",
        auth_token: "t",
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
        auth_token: "t",
        llm_provider: "gemini",
        embedder_provider: "gemini"
      }

      yaml = Config.build_yaml(cfg)

      refute yaml =~ "model:"
    end

    test "includes model key when llm_model is set" do
      cfg = %Config{
        data_dir: "/d",
        server_dir: "/s",
        server_url: "u",
        auth_token: "t",
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
        auth_token: "t",
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
