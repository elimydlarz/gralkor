defmodule Gralkor.Client.NativeTest do
  use ExUnit.Case, async: true

  alias Gralkor.Client.Native
  alias Gralkor.Message

  describe "ex-client-native > if capture is called with a blank string session_id" do
    test "raises ArgumentError" do
      assert_raise ArgumentError, ~r/session_id/, fn ->
        Native.capture("", "g", [Message.new("user", "x")])
      end
    end
  end

  describe "ex-client-native > if capture is called with a nil session_id" do
    test "raises ArgumentError" do
      assert_raise ArgumentError, ~r/session_id/, fn ->
        Native.capture(nil, "g", [Message.new("user", "x")])
      end
    end
  end

  describe "ex-client-native > if end_session is called with a blank string session_id" do
    test "raises ArgumentError" do
      assert_raise ArgumentError, ~r/session_id/, fn ->
        Native.end_session("")
      end
    end
  end

  describe "ex-client-native > if end_session is called with a nil session_id" do
    test "raises ArgumentError" do
      assert_raise ArgumentError, ~r/session_id/, fn ->
        Native.end_session(nil)
      end
    end
  end
end
