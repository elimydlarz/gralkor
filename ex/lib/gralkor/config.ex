defmodule Gralkor.Config do
  @moduledoc """
  Configuration for the embedded Gralkor runtime.

  Two operator-facing knobs decide what `:gralkor_ex` does at boot:

    * The FalkorDB connection — either embedded (`falkordblite` spawns a local
      `redis-server` child under a directory chosen by `GRALKOR_DATA_DIR`) or
      remote (network `host:port` plus optional credentials, set via the
      `:gralkor_ex, :falkordb` application env). Remote wins when both are
      configured. See `falkordb_spec/0`.
    * The LLM and embedder models — read from the `GRALKOR_LLM_MODEL` and
      `GRALKOR_EMBEDDER_MODEL` env vars, falling back to the defaults below.

  Models are stored as req_llm-style `"provider:model"` strings — when graphiti
  needs them split, the provider/model halves are extracted at the call site.
  """

  # Defaults match server-side gralkor/server/main.py — both stacks pick the
  # same model so consumers see identical output.
  @default_llm_model "google:gemini-3.1-flash-lite"
  @default_embedder_model "google:gemini-embedding-2-preview"

  @typedoc """
  Resolved FalkorDB selection. `:remote` carries the validated keyword list
  the operator supplied; `:embedded` carries the expanded data directory.
  """
  @type falkordb_spec :: {:remote, keyword()} | {:embedded, String.t()}

  @doc """
  Resolve the FalkorDB connection spec from configuration. Returns `nil`
  when neither knob is set so the supervisor can run with no children.

  Remote wins over embedded when both are present.
  """
  @spec falkordb_spec() :: falkordb_spec() | nil
  def falkordb_spec do
    case Application.get_env(:gralkor_ex, :falkordb) do
      nil ->
        embedded_spec()

      kw ->
        {:remote, validate_falkordb!(kw)}
    end
  end

  defp embedded_spec do
    case System.get_env("GRALKOR_DATA_DIR") do
      nil -> nil
      "" -> nil
      dir -> {:embedded, Path.expand(dir)}
    end
  end

  @doc """
  Validate a remote FalkorDB keyword spec. Raises `ArgumentError` with a
  pointed message if the shape is wrong; returns the keyword list unchanged
  on success.
  """
  @spec validate_falkordb!(any()) :: keyword()
  def validate_falkordb!(kw) do
    unless Keyword.keyword?(kw) do
      raise ArgumentError,
            "expected :gralkor_ex, :falkordb to be a keyword list with :host and :port; got #{inspect(kw)}"
    end

    host = Keyword.get(kw, :host)
    port = Keyword.get(kw, :port)

    unless is_binary(host) and host != "" do
      raise ArgumentError,
            ":gralkor_ex, :falkordb requires :host (non-blank string); got #{inspect(host)}"
    end

    unless is_integer(port) and port > 0 do
      raise ArgumentError,
            ":gralkor_ex, :falkordb requires :port (positive integer); got #{inspect(port)}"
    end

    kw
  end

  @spec llm_model() :: String.t()
  def llm_model do
    case System.get_env("GRALKOR_LLM_MODEL") do
      nil -> @default_llm_model
      "" -> @default_llm_model
      m -> m
    end
  end

  @spec embedder_model() :: String.t()
  def embedder_model do
    case System.get_env("GRALKOR_EMBEDDER_MODEL") do
      nil -> @default_embedder_model
      "" -> @default_embedder_model
      m -> m
    end
  end
end
