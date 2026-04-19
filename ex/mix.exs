defmodule Gralkor.MixProject do
  use Mix.Project

  @version "1.0.3"
  @source_url "https://github.com/elimydlarz/gralkor"

  def project do
    [
      app: :gralkor,
      version: @version,
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      compilers: Mix.compilers() ++ [:gralkor_priv],
      releases: releases(),
      aliases: aliases(),
      preferred_cli_env: [
        "test.unit": :test,
        "test.integration": :test,
        "test.functional": :test
      ],
      test_coverage: [summary: [threshold: 0]],
      description: description(),
      package: package(),
      source_url: @source_url,
      docs: docs()
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
      {:req, "~> 0.5"},
      {:jason, "~> 1.4"},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  defp releases do
    [
      gralkor: [
        include_executables_for: [:unix],
        applications: [runtime_tools: :permanent]
      ]
    ]
  end

  defp aliases do
    [
      "test.unit": ["test --exclude integration --exclude functional"],
      "test.integration": ["test --only integration"],
      "test.functional": ["test --only functional"]
    ]
  end

  defp description do
    "OTP supervisor for Gralkor — spawns and owns the Python memory server (Graphiti + FalkorDB) as a Port. Embed in a Jido (or any Elixir) supervision tree to give your agent long-term, temporally-aware knowledge-graph memory."
  end

  defp package do
    [
      maintainers: ["susu-eng"],
      licenses: ["MIT"],
      links: %{
        "GitHub" => @source_url,
        "Issues" => "#{@source_url}/issues"
      },
      files: ~w(lib priv config mix.exs README.md .formatter.exs)
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
