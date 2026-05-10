"""Library contract test: the redislite resume-cache trap.

Pins the upstream behaviour that both `:gralkor_ex` and `@susulabs/gralkor`
defend against. `redislite` writes a `${dbfile}.settings` resume-cache next
to the configured db file. On every subsequent `AsyncFalkorDB(db_path)`
call it reads that cache and decides "is the previous server still
running?" by checking `kill -0 <pidfile_PID>`.

That check is too weak: it returns true for zombies (`<defunct>`,
unreaped by container PID 1) and for any unrelated process the OS has
since assigned the recycled PID. When it returns true, redislite skips
spawning a fresh server and blindly reconnects to the cached
`unixsocket` — which fails with `ConnectionError` because no real redis
is listening there.

There is no fallback: the failure propagates out of `AsyncFalkorDB.__init__`
unchanged. The only way to recover without restarting the container is
to delete the resume-cache file before instantiating `AsyncFalkorDB`,
which both adapters do (see `ts-server-manager` and `ex-graphiti-pool`
trees in TEST_TREES.md).

If this test ever stops failing, redislite has fixed its liveness check
upstream and the adapter-side `unlink` becomes redundant. Until then,
this test documents *why* the unlink is load-bearing.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def short_tmp_path():
    """`tmp_path` lives under `/private/var/folders/.../pytest-of-USER/...`
    on macOS, easily exceeding the BSD 104-char AF_UNIX path limit. The
    socket files used here must live under a short path or `connect()`
    raises `AF_UNIX path too long` instead of the trap we're testing."""
    p = Path(tempfile.mkdtemp(prefix="grl-trap-"))
    try:
        yield p
    finally:
        shutil.rmtree(p, ignore_errors=True)


@pytest.mark.asyncio
async def test_resume_cache_with_live_pid_traps_into_dead_socket(short_tmp_path):
    """Settings file + live (non-redis) PID in pidfile + non-listening socket
    causes AsyncFalkorDB to raise ConnectionError on the cached socket path."""
    from redis.exceptions import ConnectionError as RedisConnectionError
    from redislite.async_falkordb_client import AsyncFalkorDB

    data_dir = short_tmp_path / "data"
    data_dir.mkdir()
    db_path = data_dir / "gralkor.db"

    stale_tmp = short_tmp_path / "stale_tmp"
    stale_tmp.mkdir()
    stale_socket = stale_tmp / "redis.socket"
    stale_pidfile = stale_tmp / "redis.pid"

    # The current test process is guaranteed alive — `kill -0 os.getpid()`
    # always succeeds. Stands in for the zombie/recycled-PID case
    # without spawning or killing anything.
    stale_pidfile.write_text(str(os.getpid()))
    # A regular file at the socket path so connect() fails with ENOTSOCK
    # (Errno 38). On the live VPS the same path was a real but unlistened
    # socket failing with ECONNREFUSED (Errno 111); both surface as
    # ConnectionError from the same connect_check_health line.
    stale_socket.write_text("")

    settings = {
        "pidfile": str(stale_pidfile),
        "unixsocket": str(stale_socket),
        "dbdir": str(data_dir),
        "dbfilename": "gralkor.db",
    }
    (data_dir / "gralkor.db.settings").write_text(json.dumps(settings))

    with pytest.raises(RedisConnectionError) as exc:
        AsyncFalkorDB(str(db_path))

    assert str(stale_socket) in str(exc.value)


@pytest.mark.asyncio
async def test_unlinking_resume_cache_breaks_the_trap(short_tmp_path):
    """Deleting `gralkor.db.settings` before AsyncFalkorDB() forces redislite
    to allocate a fresh tmpdir and fork a fresh redis-server — boot succeeds.

    This is the mitigation both adapters apply at the call site."""
    from redislite.async_falkordb_client import AsyncFalkorDB

    data_dir = short_tmp_path / "data"
    data_dir.mkdir()
    db_path = data_dir / "gralkor.db"

    stale_tmp = short_tmp_path / "stale_tmp"
    stale_tmp.mkdir()
    (stale_tmp / "redis.socket").write_text("")
    (stale_tmp / "redis.pid").write_text(str(os.getpid()))
    settings_path = data_dir / "gralkor.db.settings"
    settings_path.write_text(json.dumps({
        "pidfile": str(stale_tmp / "redis.pid"),
        "unixsocket": str(stale_tmp / "redis.socket"),
        "dbdir": str(data_dir),
        "dbfilename": "gralkor.db",
    }))

    settings_path.unlink()

    db = AsyncFalkorDB(str(db_path))
    try:
        rewritten = json.loads(settings_path.read_text())
        assert Path(rewritten["unixsocket"]).exists()
        assert rewritten["unixsocket"] != str(stale_tmp / "redis.socket")
    finally:
        try:
            await db.aclose()
        except Exception:
            pass
