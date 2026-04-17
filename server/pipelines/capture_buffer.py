from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from .distill import Turn


logger = logging.getLogger(__name__)


DEFAULT_RETRY_DELAYS: tuple[float, ...] = (1.0, 2.0, 4.0)


class CaptureClientError(Exception):
    """Raised when a downstream client returned a non-retryable 4xx response."""


FlushCallback = Callable[[str, list[Turn]], Awaitable[None]]


@dataclass
class _Entry:
    turns: list[Turn] = field(default_factory=list)
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

    def append(self, group_id: str, turn: Turn) -> None:
        entry = self._entries.get(group_id)
        if entry is None:
            entry = _Entry()
            self._entries[group_id] = entry
        entry.turns.append(turn)
        if entry.idle_handle is not None:
            entry.idle_handle.cancel()
        loop = asyncio.get_running_loop()
        entry.idle_handle = loop.call_later(
            self._idle_seconds, self._schedule_flush, group_id
        )

    def _schedule_flush(self, group_id: str) -> None:
        entry = self._entries.pop(group_id, None)
        if entry is None or not entry.turns:
            return
        task = asyncio.create_task(self._flush_with_retry(group_id, entry.turns))
        self._pending_flushes.add(task)
        task.add_done_callback(self._pending_flushes.discard)

    async def _flush_with_retry(self, group_id: str, turns: list[Turn]) -> None:
        attempt = 0
        while True:
            try:
                await self._flush_callback(group_id, turns)
                return
            except CaptureClientError as err:
                logger.error(
                    "capture dropped (4xx) group=%s turns=%d err=%s",
                    group_id,
                    len(turns),
                    err,
                )
                return
            except Exception as err:
                if attempt >= len(self._retry_delays):
                    logger.error(
                        "capture exhausted group=%s turns=%d err=%s",
                        group_id,
                        len(turns),
                        err,
                    )
                    return
                logger.warning(
                    "capture retry group=%s attempt=%d err=%s",
                    group_id,
                    attempt + 1,
                    err,
                )
                await asyncio.sleep(self._retry_delays[attempt])
                attempt += 1

    async def flush_all(self) -> None:
        for group_id in list(self._entries.keys()):
            entry = self._entries.pop(group_id, None)
            if entry is None:
                continue
            if entry.idle_handle is not None:
                entry.idle_handle.cancel()
            if entry.turns:
                task = asyncio.create_task(
                    self._flush_with_retry(group_id, entry.turns)
                )
                self._pending_flushes.add(task)
                task.add_done_callback(self._pending_flushes.discard)
        if self._pending_flushes:
            await asyncio.gather(*self._pending_flushes, return_exceptions=True)

    @property
    def pending_count(self) -> int:
        return sum(len(entry.turns) for entry in self._entries.values())

    def has(self, group_id: str) -> bool:
        return group_id in self._entries
