"""Tree: capture-buffer (Python).

Per-group_id asyncio buffer with idle flush, retry schedule, and flush_all.
Used by POST /capture to batch turns before ingestion.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from pipelines.capture_buffer import CaptureBuffer, CaptureClientError
from pipelines.distill import Turn, TurnEvent


def make_turn(user: str = "q", answer: str = "a") -> Turn:
    return Turn(user_query=user, events=[], assistant_answer=answer)


@pytest.fixture
def flush_callback():
    return AsyncMock()


class TestAppend:
    async def test_creates_entry_on_first_append(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("grp", make_turn())
        assert buffer.has("grp")
        assert buffer.pending_count == 1

    async def test_accumulates_turns_for_same_group(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("grp", make_turn("q1"))
        buffer.append("grp", make_turn("q2"))
        assert buffer.pending_count == 2

    async def test_separate_entries_per_group(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=1.0, flush_callback=flush_callback)
        buffer.append("a", make_turn())
        buffer.append("b", make_turn())
        assert buffer.has("a")
        assert buffer.has("b")
        assert buffer.pending_count == 2

    async def test_reschedules_idle_timer_on_new_append(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.05, flush_callback=flush_callback)
        buffer.append("grp", make_turn("q1"))
        await asyncio.sleep(0.03)
        buffer.append("grp", make_turn("q2"))
        await asyncio.sleep(0.03)
        flush_callback.assert_not_awaited()
        await asyncio.sleep(0.05)
        flush_callback.assert_awaited_once()


class TestIdleFlush:
    async def test_flushes_after_idle_elapsed(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("grp", make_turn("q1"))
        buffer.append("grp", make_turn("q2"))
        await asyncio.sleep(0.05)
        flush_callback.assert_awaited_once()
        args = flush_callback.await_args.args
        assert args[0] == "grp"
        assert len(args[1]) == 2

    async def test_does_not_flush_empty_entry(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        await asyncio.sleep(0.05)
        flush_callback.assert_not_awaited()

    async def test_independent_flushes_per_group(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("a", make_turn("a1"))
        buffer.append("b", make_turn("b1"))
        await asyncio.sleep(0.05)
        assert flush_callback.await_count == 2
        invoked_groups = {call.args[0] for call in flush_callback.await_args_list}
        assert invoked_groups == {"a", "b"}

    async def test_removes_entry_on_flush(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=0.02, flush_callback=flush_callback)
        buffer.append("grp", make_turn())
        await asyncio.sleep(0.05)
        assert not buffer.has("grp")


class TestRetry:
    async def test_retries_on_generic_failure(self, flush_callback):
        flush_callback.side_effect = [RuntimeError("boom"), None]
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("grp", make_turn())
        await asyncio.sleep(0.1)
        assert flush_callback.await_count == 2

    async def test_does_not_retry_on_4xx(self, flush_callback):
        flush_callback.side_effect = CaptureClientError("bad request")
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("grp", make_turn())
        await asyncio.sleep(0.1)
        assert flush_callback.await_count == 1

    async def test_gives_up_after_exhausting_retries(self, flush_callback, caplog):
        flush_callback.side_effect = RuntimeError("boom")
        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=flush_callback,
            retry_delays=(0.01, 0.01, 0.01),
        )
        buffer.append("grp", make_turn())
        import logging

        with caplog.at_level(logging.ERROR):
            await asyncio.sleep(0.2)
        assert flush_callback.await_count == 4
        assert any("exhausted" in rec.message for rec in caplog.records)

    async def test_uses_exponential_delays(self, flush_callback):
        flush_callback.side_effect = RuntimeError("boom")
        call_times: list[float] = []

        async def record(_group, _turns):
            call_times.append(asyncio.get_event_loop().time())
            raise RuntimeError("boom")

        buffer = CaptureBuffer(
            idle_seconds=0.01,
            flush_callback=record,
            retry_delays=(0.05, 0.1, 0.2),
        )
        buffer.append("grp", make_turn())
        await asyncio.sleep(0.5)
        gap1 = call_times[1] - call_times[0]
        gap2 = call_times[2] - call_times[1]
        gap3 = call_times[3] - call_times[2]
        assert 0.04 <= gap1 <= 0.15
        assert 0.08 <= gap2 <= 0.2
        assert 0.15 <= gap3 <= 0.3


class TestFlushAll:
    async def test_flushes_all_pending_groups_immediately(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("a", make_turn())
        buffer.append("b", make_turn())
        await buffer.flush_all()
        assert flush_callback.await_count == 2

    async def test_cancels_idle_timers(self, flush_callback):
        buffer = CaptureBuffer(idle_seconds=10.0, flush_callback=flush_callback)
        buffer.append("a", make_turn())
        await buffer.flush_all()
        assert not buffer.has("a")

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
        buffer.append("a", make_turn())
        buffer.append("b", make_turn())
        await buffer.flush_all()
        assert flush_callback.await_count == 2
