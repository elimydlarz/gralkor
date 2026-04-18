defmodule Mix.Tasks.Compile.GralkorPriv do
  @moduledoc false

  use Mix.Task.Compiler

  @priv_dest "priv/server"
  @skip_dirs ~w(.venv __pycache__ wheels tests mutants)
  @skip_ext ~w(.pyc)

  @impl true
  def run(_args) do
    src = Path.expand("../server", File.cwd!())

    if File.dir?(src) do
      dest = Path.expand(@priv_dest, File.cwd!())
      File.mkdir_p!(dest)
      copy_tree(src, dest)
      :ok
    else
      :noop
    end
  end

  defp copy_tree(src, dest) do
    for entry <- File.ls!(src), keep?(entry) do
      src_path = Path.join(src, entry)
      dest_path = Path.join(dest, entry)

      cond do
        File.dir?(src_path) ->
          File.mkdir_p!(dest_path)
          copy_tree(src_path, dest_path)

        stale?(src_path, dest_path) ->
          File.cp!(src_path, dest_path)

        true ->
          :ok
      end
    end
  end

  defp keep?(entry) do
    entry not in @skip_dirs and Path.extname(entry) not in @skip_ext
  end

  defp stale?(src_path, dest_path) do
    case File.stat(dest_path) do
      {:ok, %{mtime: dest_mtime}} ->
        {:ok, %{mtime: src_mtime}} = File.stat(src_path)
        dest_mtime < src_mtime

      {:error, _} ->
        true
    end
  end
end
