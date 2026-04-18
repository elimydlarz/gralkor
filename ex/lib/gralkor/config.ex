defmodule Gralkor.Config do
  @moduledoc """
  Reads env vars, builds the config map, writes config.yaml for the Python server.
  """

  @enforce_keys [:data_dir, :server_dir, :server_url]
  defstruct [
    :data_dir,
    :server_dir,
    :server_url,
    :llm_provider,
    :llm_model,
    :embedder_provider,
    :embedder_model,
    :capture_idle_seconds,
    :test
  ]

  @type t :: %__MODULE__{
          data_dir: String.t(),
          server_dir: String.t(),
          server_url: String.t(),
          llm_provider: String.t(),
          llm_model: String.t() | nil,
          embedder_provider: String.t(),
          embedder_model: String.t() | nil,
          capture_idle_seconds: number() | nil,
          test: boolean() | nil
        }

  @spec from_env() :: t()
  def from_env do
    %__MODULE__{
      data_dir: "GRALKOR_DATA_DIR" |> System.fetch_env!() |> Path.expand(),
      server_dir: System.get_env("GRALKOR_SERVER_DIR", default_server_dir()),
      server_url: System.get_env("GRALKOR_SERVER_URL", "http://127.0.0.1:4000"),
      llm_provider: System.get_env("GRALKOR_LLM_PROVIDER"),
      llm_model: System.get_env("GRALKOR_LLM_MODEL"),
      embedder_provider: System.get_env("GRALKOR_EMBEDDER_PROVIDER"),
      embedder_model: System.get_env("GRALKOR_EMBEDDER_MODEL"),
      test: truthy_env?("GRALKOR_TEST")
    }
  end

  @spec default_server_dir() :: String.t()
  def default_server_dir do
    case :code.priv_dir(:gralkor) do
      {:error, :bad_name} -> "/app/server"
      priv -> Path.join(to_string(priv), "server")
    end
  end

  @spec write_yaml(t()) :: :ok
  def write_yaml(%__MODULE__{} = cfg) do
    File.mkdir_p!(cfg.data_dir)
    path = Path.join(cfg.data_dir, "config.yaml")
    File.write!(path, build_yaml(cfg))
    :ok
  end

  @spec build_yaml(t()) :: String.t()
  def build_yaml(%__MODULE__{} = cfg) do
    [
      provider_section("llm", cfg.llm_provider, cfg.llm_model),
      provider_section("embedder", cfg.embedder_provider, cfg.embedder_model),
      capture_section(cfg.capture_idle_seconds),
      test_section(cfg.test)
    ]
    |> List.flatten()
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n")
    |> Kernel.<>("\n")
  end

  defp provider_section(_key, nil, _model), do: []

  defp provider_section(key, provider, model) do
    ["#{key}:", "  provider: #{provider}", optional("  model", model)]
  end

  defp capture_section(nil), do: []
  defp capture_section(idle), do: ["capture:", "  idle_seconds: #{idle}"]

  defp test_section(true), do: ["test: true"]
  defp test_section(_), do: []

  defp optional(_key, nil), do: nil
  defp optional(key, value), do: "#{key}: #{value}"

  defp truthy_env?(name) do
    case System.get_env(name) do
      v when is_binary(v) -> String.downcase(v) in ["true", "1", "yes"]
      _ -> false
    end
  end
end
