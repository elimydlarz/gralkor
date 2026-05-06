defmodule Gralkor.MixProject do
  use Mix.Project

  @version "2.1.2"
  @source_url "https://github.com/elimydlarz/gralkor"

  def project do
    [
      app: :gralkor_ex,
      version: @version,
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps(),
      releases: releases(),
      aliases: aliases(),
      test_coverage: [summary: [threshold: 0]],
      description: description(),
      package: package(),
      source_url: @source_url,
      docs: docs()
    ]
  end

  def cli do
    [
      preferred_envs: [
        "test.unit": :test,
        "test.integration": :test,
        "test.functional": :test
      ]
    ]
  end

  def application do
    [
      mod: {Gralkor.Application, []},
      extra_applications: [:logger, :inets, :ssl]
    ]
  end

  defp deps do
    [
      {:pythonx, "~> 0.4"},
      {:req_llm, "~> 1.0"},
      {:jason, "~> 1.4"},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp releases do
    [
      gralkor_ex: [
        include_executables_for: [:unix],
        applications: [runtime_tools: :permanent]
      ]
    ]
  end

  defp aliases do
    [
      "test.unit": ["test --exclude integration --exclude functional"],
      "test.integration": ["test --include integration --exclude functional"],
      "test.functional": ["test --include functional --include integration"]
    ]
  end

  defp description do
    "Embedded Gralkor memory for Elixir/OTP — runs Graphiti + FalkorDB in-process via PythonX. Embed in a Jido (or any Elixir) supervision tree to give your agent long-term, temporally-aware knowledge-graph memory."
  end

  defp package do
    [
      maintainers: ["susu-eng"],
      licenses: ["MIT"],
      links: %{
        "GitHub" => @source_url,
        "Issues" => "#{@source_url}/issues"
      },
      files: ~w(lib config mix.exs README.md .formatter.exs)
    ]
  end

  defp docs do
    [
      main: "readme",
      source_url: @source_url,
      extras: ["README.md"]
    ]
  end
end
