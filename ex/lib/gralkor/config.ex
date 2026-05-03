defmodule Gralkor.Config do
  @moduledoc """
  Configuration for the embedded Gralkor runtime.

  Single source of truth for default LLM and embedder model selection. Both
  graphiti-core's bundled Python clients (used inside `add_episode` / `search`)
  and req_llm (used by `Gralkor.Distill` / `Gralkor.Interpret` for Elixir-side
  pre/post-processing) read from here.

  Models are stored as req_llm-style `"provider:model"` strings — when graphiti
  needs them split, the provider/model halves are extracted at the call site.
  """

  # Defaults match server-side gralkor/server/main.py — both stacks pick the
  # same model so consumers see identical output.
  @default_llm_model "google:gemini-3.1-flash-lite-preview"
  @default_embedder_model "google:gemini-embedding-2-preview"

  @enforce_keys [:data_dir]
  defstruct [:data_dir, :llm_model, :embedder_model]

  @type t :: %__MODULE__{
          data_dir: String.t(),
          llm_model: String.t() | nil,
          embedder_model: String.t() | nil
        }

  @spec from_env() :: t()
  def from_env do
    %__MODULE__{
      data_dir: "GRALKOR_DATA_DIR" |> System.fetch_env!() |> Path.expand(),
      llm_model: System.get_env("GRALKOR_LLM_MODEL"),
      embedder_model: System.get_env("GRALKOR_EMBEDDER_MODEL")
    }
  end

  @spec llm_model(t()) :: String.t()
  def llm_model(%__MODULE__{llm_model: nil}), do: @default_llm_model
  def llm_model(%__MODULE__{llm_model: m}), do: m

  @spec embedder_model(t()) :: String.t()
  def embedder_model(%__MODULE__{embedder_model: nil}), do: @default_embedder_model
  def embedder_model(%__MODULE__{embedder_model: m}), do: m
end
