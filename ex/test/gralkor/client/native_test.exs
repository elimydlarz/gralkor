defmodule Gralkor.Client.NativeTest do
  use ExUnit.Case, async: false

  require Logger

  alias Gralkor.CaptureBuffer
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

  describe "ex-capture > observability > when test mode is enabled" do
    setup do
      Application.put_env(:gralkor_ex, :test, true)
      pid = start_supervised!({CaptureBuffer, [flush_callback: fn _g, _t -> :ok end]})
      on_exit(fn -> Application.delete_env(:gralkor_ex, :test) end)
      {:ok, buffer: pid}
    end

    @tag :capture_log
    test "logs the captured messages" do
      logs =
        ExUnit.CaptureLog.capture_log(fn ->
          :ok =
            Native.capture("s1", "g", [
              Message.new("user", "hello"),
              Message.new("assistant", "hi there")
            ])
        end)

      assert logs =~ "[gralkor] [test] capture messages:"
      assert logs =~ "(user, \"hello\")"
      assert logs =~ "(assistant, \"hi there\")"
    end
  end

  describe "ex-capture > observability > when test mode is disabled" do
    setup do
      pid = start_supervised!({CaptureBuffer, [flush_callback: fn _g, _t -> :ok end]})
      {:ok, buffer: pid}
    end

    @tag :capture_log
    test "does not log the captured messages" do
      logs =
        ExUnit.CaptureLog.capture_log(fn ->
          :ok = Native.capture("s1", "g", [Message.new("user", "hello")])
        end)

      refute logs =~ "[gralkor] [test]"
    end
  end
end
