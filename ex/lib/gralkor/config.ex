defmodule Gralkor.Config do
  @moduledoc """
  Reads env vars, builds the config map, writes config.yaml for the Python server.
  """

  @enforce_keys [:data_dir, :server_dir, :server_url, :auth_token]
  defstruct [
    :data_dir,
    :server_dir,
    :server_url,
    :auth_token,
    :llm_provider,
    :llm_model,
    :embedder_provider,
    :embedder_model,
    :capture_idle_seconds
  ]

  @type t :: %__MODULE__{
          data_dir: String.t(),
          server_dir: String.t(),
          server_url: String.t(),
          auth_token: String.t(),
          llm_provider: String.t(),
          llm_model: String.t() | nil,
          embedder_provider: String.t(),
          embedder_model: String.t() | nil,
          capture_idle_seconds: number() | nil
        }

  @spec from_env() :: t()
  def from_env do
    %__MODULE__{
      data_dir: System.fetch_env!("GRALKOR_DATA_DIR"),
      server_dir: System.get_env("GRALKOR_SERVER_DIR", "/app/server"),
      server_url: System.get_env("GRALKOR_SERVER_URL", "http://127.0.0.1:4000"),
      auth_token: System.fetch_env!("GRALKOR_AUTH_TOKEN"),
      llm_provider: System.get_env("GRALKOR_LLM_PROVIDER"),
      llm_model: System.get_env("GRALKOR_LLM_MODEL"),
      embedder_provider: System.get_env("GRALKOR_EMBEDDER_PROVIDER"),
      embedder_model: System.get_env("GRALKOR_EMBEDDER_MODEL")
    }
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
      "llm:",
      "  provider: #{cfg.llm_provider}",
      optional("  model", cfg.llm_model),
      "embedder:",
      "  provider: #{cfg.embedder_provider}",
      optional("  model", cfg.embedder_model),
      capture_section(cfg.capture_idle_seconds)
    ]
    |> List.flatten()
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n")
    |> Kernel.<>("\n")
  end

  defp capture_section(nil), do: []
  defp capture_section(idle), do: ["capture:", "  idle_seconds: #{idle}"]

  defp optional(_key, nil), do: nil
  defp optional(key, value), do: "#{key}: #{value}"
end
