defmodule Gralkor.Health do
  @moduledoc """
  Thin wrapper around GET /health for boot-wait and monitor polling.
  """

  @spec check(String.t(), keyword()) :: :ok | {:error, term()}
  def check(url, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 2_000)

    case Req.get(Path.join(url, "/health"), receive_timeout: timeout) do
      {:ok, %{status: 200}} -> :ok
      {:ok, %{status: status}} -> {:error, {:bad_status, status}}
      {:error, reason} -> {:error, reason}
    end
  end
end
