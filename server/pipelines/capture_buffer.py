from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from .messages import Message


logger = logging.getLogger(__name__)


DEFAULT_RETRY_DELAYS: tuple[float, ...] = (1.0, 2.0, 4.0)


class CaptureClientError(Exception):
    """Raised when a downstream client returned a non-retryable 4xx response."""


FlushCallback = Callable[[str, list[list[Message]]], Awaitable[None]]


@dataclass
class _Entry:
    group_id: str
    turns: list[list[Message]] = field(default_factory=list)
    idle_handle: asyncio.TimerHandle | None = None


class CaptureBuffer:
    def __init__(
        self,
        idle_seconds: float,
        flush_callback: FlushCallback,
        retry_delays: tuple[float, ...] = DEFAULT_RETRY_DELAYS,
    ) -> None:
        self._entries: dict[str, _Entry] = {}
        self._idle_seconds = idle_seconds
        self._flush_callback = flush_callback
        self._retry_delays = retry_delays
        self._pending_flushes: set[asyncio.Task[None]] = set()

    def append(self, session_id: str, group_id: str, messages: list[Message]) -> None:
        entry = self._entries.get(session_id)
        if entry is None:
            entry = _Entry(group_id=group_id)
            self._entries[session_id] = entry
        elif entry.group_id != group_id:
            raise ValueError(
                f"session_id {session_id!r} already bound to group_id "
                f"{entry.group_id!r}; refusing to rebind to {group_id!r}"
            )
        entry.turns.append(list(messages))
        if entry.idle_handle is not None:
            entry.idle_handle.cancel()
        loop = asyncio.get_running_loop()
        entry.idle_handle = loop.call_later(
            self._idle_seconds, self._schedule_flush, session_id
        )

    def turns_for(self, session_id: str) -> list[list[Message]]:
        entry = self._entries.get(session_id)
        return [list(turn) for turn in entry.turns] if entry is not None else []

    def _schedule_flush(self, session_id: str) -> None:
        entry = self._entries.pop(session_id, None)
        if entry is None or not entry.turns:
            return
        task = asyncio.create_task(
            self._flush_with_retry(session_id, entry.group_id, entry.turns)
        )
        self._pending_flushes.add(task)
        task.add_done_callback(self._pending_flushes.discard)

    async def _flush_with_retry(
        self, session_id: str, group_id: str, turns: list[list[Message]]
    ) -> None:
        attempt = 0
        while True:
            try:
                await self._flush_callback(group_id, turns)
                return
            except CaptureClientError as err:
                logger.error(
                    "capture dropped (4xx) session=%s group=%s turns=%d err=%s",
                    session_id,
                    group_id,
                    len(turns),
                    err,
                )
                return
            except Exception as err:
                if attempt >= len(self._retry_delays):
                    logger.error(
                        "capture exhausted session=%s group=%s turns=%d err=%s",
                        session_id,
                        group_id,
                        len(turns),
                        err,
                    )
                    return
                logger.warning(
                    "capture retry session=%s group=%s attempt=%d err=%s",
                    session_id,
                    group_id,
                    attempt + 1,
                    err,
                )
                await asyncio.sleep(self._retry_delays[attempt])
                attempt += 1

    def flush(self, session_id: str) -> None:
        entry = self._entries.pop(session_id, None)
        if entry is None:
            return
        if entry.idle_handle is not None:
            entry.idle_handle.cancel()
        task = asyncio.create_task(
            self._flush_with_retry(session_id, entry.group_id, entry.turns)
        )
        self._pending_flushes.add(task)
        task.add_done_callback(self._pending_flushes.discard)

    async def flush_all(self) -> None:
        for session_id in list(self._entries.keys()):
            entry = self._entries.pop(session_id, None)
            if entry is None:
                continue
            if entry.idle_handle is not None:
                entry.idle_handle.cancel()
            if entry.turns:
                task = asyncio.create_task(
                    self._flush_with_retry(session_id, entry.group_id, entry.turns)
                )
                self._pending_flushes.add(task)
                task.add_done_callback(self._pending_flushes.discard)
        if self._pending_flushes:
            await asyncio.gather(*self._pending_flushes, return_exceptions=True)

    @property
    def pending_count(self) -> int:
        return sum(len(entry.turns) for entry in self._entries.values())

    def has(self, session_id: str) -> bool:
        return session_id in self._entries
