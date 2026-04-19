"""Tree: capture-buffer (Python).

Per-session_id asyncio buffer with idle flush, retry schedule, and flush_all.
Each entry stores the group_id bound on first append, so the flush routes the
episode to the right FalkorDB graph without the session id needing to encode it.
Used by POST /capture to batch turns before ingestion.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from pipelines.capture_buffer import (
    CaptureBuffer,
    CaptureClientError,
    turns_to_conversation,
)
from pipelines.distill import Turn
from pipelines.message_clean import ConversationMessage


def make_turn(user: str = "q", answer: str = "a") -> Turn:
    return Turn(user_query=user, events=[], assistant_answer=answer)


@pytest.fixture
def flush_callback():
    return AsyncMock()


class TestAppend:
    async def test_creates_entry_on_first_append(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn())
        assert buffer.has("sess-1")
        assert buffer.pending_count == 1

    async def test_accumulates_turns_for_same_session(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn("q1"))
        buffer.append("sess-1", "grp", make_turn("q2"))
        assert buffer.pending_count == 2

    async def test_separate_entries_per_session_within_same_group(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("sess-a", "grp", make_turn("a1"))
        buffer.append("sess-b", "grp", make_turn("b1"))
        assert buffer.has("sess-a")
        assert buffer.has("sess-b")
        assert buffer.pending_count == 2

    async def test_rebinding_session_to_different_group_raises(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp-a", make_turn())
        with pytest.raises(ValueError, match="session_id"):
            buffer.append("sess-1", "grp-b", make_turn())

    async def test_reschedules_idle_timer_on_new_append(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.05, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn("q1"))
        await asyncio.sleep(0.03)
        buffer.append("sess-1", "grp", make_turn("q2"))
        await asyncio.sleep(0.03)
        flush_callback.assert_not_awaited()
        await asyncio.sleep(0.05)
        flush_callback.assert_awaited_once()


class TestTurnsFor:
    async def test_returns_buffered_turns_in_order(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn("first"))
        buffer.append("sess-1", "grp", make_turn("second"))
        turns = buffer.turns_for("sess-1")
        assert [t.user_query for t in turns] == ["first", "second"]

    async def test_returns_empty_when_session_unknown(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        assert buffer.turns_for("never-captured") == []

    async def test_returns_empty_after_flush(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn())
        await buffer.flush_all()
        assert buffer.turns_for("sess-1") == []


class TestIdleFlush:
    async def test_flushes_after_idle_elapsed(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn("q1"))
        buffer.append("sess-1", "grp", make_turn("q2"))
        await asyncio.sleep(0.05)
        flush_callback.assert_awaited_once()
        args = flush_callback.await_args.args
        assert args[0] == "grp"
        assert len(args[1]) == 2

    async def test_does_not_flush_empty_entry(self, flush_callback):
        CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        await asyncio.sleep(0.05)
        flush_callback.assert_not_awaited()

    async def test_independent_flushes_per_session(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("sess-a", "grp-a", make_turn("a1"))
        buffer.append("sess-b", "grp-b", make_turn("b1"))
        await asyncio.sleep(0.05)
        assert flush_callback.await_count == 2
        invoked_groups = {call.args[0] for call in flush_callback.await_args_list}
        assert invoked_groups == {"grp-a", "grp-b"}

    async def test_removes_entry_on_flush(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn())
        await asyncio.sleep(0.05)
        assert not buffer.has("sess-1")


class TestRetry:
    async def test_retries_on_generic_failure(self, flush_callback):
        flush_callback.side_effect = [RuntimeError("boom"), None]
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("sess-1", "grp", make_turn())
        await asyncio.sleep(0.1)
        assert flush_callback.await_count == 2

    async def test_does_not_retry_on_4xx(self, flush_callback):
        flush_callback.side_effect = CaptureClientError("bad request")
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("sess-1", "grp", make_turn())
        await asyncio.sleep(0.1)
        assert flush_callback.await_count == 1

    async def test_gives_up_after_exhausting_retries(self, flush_callback, caplog):
        flush_callback.side_effect = RuntimeError("boom")
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("sess-1", "grp", make_turn())
        import logging

        with caplog.at_level(logging.ERROR):
            await asyncio.sleep(0.2)
        assert flush_callback.await_count == 4
        assert any("exhausted" in rec.message for rec in caplog.records)

    async def test_uses_exponential_delays(self):
        call_times: list[float] = []

        async def record(_group, _turns):
            call_times.append(asyncio.get_event_loop().time())
            raise RuntimeError("boom")

        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=record,
            retry_delays=(0.05, 0.1, 0.2),
        )
        buffer.append("sess-1", "grp", make_turn())
        await asyncio.sleep(0.5)
        gap1 = call_times[1] - call_times[0]
        gap2 = call_times[2] - call_times[1]
        gap3 = call_times[3] - call_times[2]
        assert 0.04 <= gap1 <= 0.15
        assert 0.08 <= gap2 <= 0.2
        assert 0.15 <= gap3 <= 0.3


class TestFlushSession:
    async def test_flushes_turns_via_callback(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn("q1"))
        buffer.append("sess-1", "grp", make_turn("q2"))
        buffer.flush("sess-1")
        # Callback is scheduled, not awaited.
        await asyncio.sleep(0.01)
        flush_callback.assert_awaited_once()
        args = flush_callback.await_args.args
        assert args[0] == "grp"
        assert [t.user_query for t in args[1]] == ["q1", "q2"]

    async def test_removes_entry_immediately(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn())
        buffer.flush("sess-1")
        assert not buffer.has("sess-1")
        assert buffer.turns_for("sess-1") == []

    async def test_returns_without_awaiting_callback(self, flush_callback):
        slow_event = asyncio.Event()

        async def slow_callback(_group, _turns):
            await slow_event.wait()

        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=slow_callback)
        buffer.append("sess-1", "grp", make_turn())
        # Must return promptly even though the callback is blocked.
        buffer.flush("sess-1")
        slow_event.set()

    async def test_cancels_idle_timer(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.05, flush_callback=flush_callback)
        buffer.append("sess-1", "grp", make_turn())
        buffer.flush("sess-1")
        # If the idle timer still fires, we'd see a second callback invocation.
        await asyncio.sleep(0.1)
        assert flush_callback.await_count == 1

    async def test_noop_for_unknown_session(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.flush("never-captured")
        await asyncio.sleep(0.01)
        flush_callback.assert_not_awaited()


class TestFlushAll:
    async def test_flushes_all_pending_sessions_immediately(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-a", "grp-a", make_turn())
        buffer.append("sess-b", "grp-b", make_turn())
        await buffer.flush_all()
        assert flush_callback.await_count == 2

    async def test_cancels_idle_timers(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("sess-a", "grp", make_turn())
        await buffer.flush_all()
        assert not buffer.has("sess-a")

    async def test_returns_immediately_when_empty(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        await buffer.flush_all()
        flush_callback.assert_not_awaited()

    async def test_one_flush_fails_other_succeeds(self, flush_callback):
        flush_callback.side_effect = [CaptureClientError("bad"), None]
        buffer = CaptureBuffer(
            idle_seconds=10.0,
            flush_callback=flush_callback,
            retry_delays=(),
        )
        buffer.append("sess-a", "grp-a", make_turn())
        buffer.append("sess-b", "grp-b", make_turn())
        await buffer.flush_all()
        assert flush_callback.await_count == 2


class TestTurnsToConversation:
    def test_flattens_turn_into_user_and_assistant_messages(self):
        turns = [make_turn("hi", "hello"), make_turn("how?", "like so")]
        msgs = turns_to_conversation(turns)
        assert msgs == [
            ConversationMessage(role="user", text="hi"),
            ConversationMessage(role="assistant", text="hello"),
            ConversationMessage(role="user", text="how?"),
            ConversationMessage(role="assistant", text="like so"),
        ]

    def test_skips_empty_fields(self):
        msgs = turns_to_conversation([Turn(user_query="", events=[], assistant_answer="a")])
        assert msgs == [ConversationMessage(role="assistant", text="a")]
