defmodule Gralkor.MixProject do
  use Mix.Project

  def project do
    [
      app: :gralkor,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      releases: releases(),
      aliases: aliases(),
      preferred_cli_env: [
        "test.unit": :test,
        "test.integration": :test,
        "test.functional": :test
      ],
      test_coverage: [summary: [threshold: 0]]
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
      {:jason, "~> 1.4"}
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
      "test.unit": ["test --exclude integration"],
      "test.integration": ["test --only integration"]
    ]
  end
end
