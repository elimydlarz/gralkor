#!/usr/bin/env python3
"""Minimal HTTP server for Gralkor.Server test harness.

Serves GET /health → 200 by default. Environment overrides:
  HEALTH_STATUS         — response status code (default 200).
  FAIL_AFTER_SECONDS    — after this many seconds of uptime, /health returns 500
                           (default unset = never switch).
  SHUTDOWN_DELAY        — seconds to sleep on SIGTERM before exiting (default 0).

Run: python3 fake_gralkor.py [port=4000]
"""

from __future__ import annotations

import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


_state = {"fail": False}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            status = 500 if _state["fail"] else int(os.environ.get("HEALTH_STATUS", "200"))
            body = b'{"status":"ok"}' if status == 200 else b'{"status":"degraded"}'
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args, **kwargs):  # noqa: ARG002
        pass


def _schedule_fail_switch() -> None:
    raw = os.environ.get("FAIL_AFTER_SECONDS")
    if not raw:
        return
    delay = float(raw)

    def flip():
        _state["fail"] = True

    timer = threading.Timer(delay, flip)
    timer.daemon = True
    timer.start()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    server = HTTPServer(("127.0.0.1", port), Handler)
    _schedule_fail_switch()

    def shutdown(signum, frame):  # noqa: ARG001
        delay = float(os.environ.get("SHUTDOWN_DELAY", "0"))
        if delay > 0:
            time.sleep(delay)
        os._exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server.serve_forever()


if __name__ == "__main__":
    main()
