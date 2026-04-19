defmodule Gralkor.ClientTest do
  use ExUnit.Case, async: true

  alias Gralkor.Client

  describe "sanitize_group_id" do
    test "replaces hyphens with underscores" do
      assert Client.sanitize_group_id("my-hyphen-id") == "my_hyphen_id"
    end

    test "returns ids without hyphens unchanged" do
      assert Client.sanitize_group_id("01JRZK") == "01JRZK"
    end

    test "handles multiple consecutive hyphens" do
      assert Client.sanitize_group_id("a--b") == "a__b"
    end
  end

  describe "impl" do
    test "defaults to Client.HTTP when no config is set" do
      previous = Application.get_env(:gralkor, :client)
      Application.delete_env(:gralkor, :client)

      try do
        assert Client.impl() == Gralkor.Client.HTTP
      after
        if previous, do: Application.put_env(:gralkor, :client, previous)
      end
    end

    test "uses the configured client when set" do
      previous = Application.get_env(:gralkor, :client)
      Application.put_env(:gralkor, :client, Gralkor.Client.InMemory)

      try do
        assert Client.impl() == Gralkor.Client.InMemory
      after
        if previous,
          do: Application.put_env(:gralkor, :client, previous),
          else: Application.delete_env(:gralkor, :client)
      end
    end
  end
end
