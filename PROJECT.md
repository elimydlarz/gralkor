<!-- This file is for humans only, don't worry about it coding agent guy -->

# Project

## Now
- FalkorDBLite
- Bug:
  ```
  2026-03-02T13:41:33.815+00:00 [gralkor] Dependencies installed
  2026-03-02T13:41:33.819+00:00 [gralkor] Starting Graphiti server on port 8001
  2026-03-02T13:41:35.334+00:00 [gralkor] [server] INFO:     Started server process [19181]
  2026-03-02T13:41:35.337+00:00 [gralkor] [server] INFO:     Waiting for application startup.
  2026-03-02T13:41:35.338+00:00 [gralkor] [server] ERROR:    Traceback (most recent call last):
  2026-03-02T13:41:35.341+00:00 [gralkor] [server]   File "/data/.openclaw/extensions/gralkor/.gralkor-data/venv/lib/python3.14/site-packages/starlette/routing.py", line 694, in lifespan
  2026-03-02T13:41:35.343+00:00 [gralkor] [server]     async with self.lifespan_context(app) as maybe_state:
  2026-03-02T13:41:35.344+00:00 [gralkor] [server]                ~~~~~~~~~~~~~~~~~~~~~^^^^^
  2026-03-02T13:41:35.345+00:00 [gralkor] [server]   File "/home/linuxbrew/.linuxbrew/lib/python3.14/contextlib.py", line 214, in __aenter__
  2026-03-02T13:41:35.347+00:00 [gralkor] [server]     return await anext(self.gen)
  2026-03-02T13:41:35.350+00:00 [gralkor] [server]            ^^^^^^^^^^^^^^^^^^^^^
  2026-03-02T13:41:35.351+00:00 [gralkor] [server]   File "/data/.openclaw/extensions/gralkor/server/main.py", line 96, in lifespan
  2026-03-02T13:41:35.352+00:00 [gralkor] [server]     from falkordblite import AsyncFalkorDB
  2026-03-02T13:41:35.353+00:00 [gralkor] [server] ModuleNotFoundError: No module named 'falkordblite'
  ```
  Theory:
  Now I see the full picture. The registerServerService calls api.registerService({ id: "gralkor-server", start() {...} }). That service's start() should be called by OpenClaw when the plugin loads. The fact that we see zero [gralkor] Starting... or [gralkor] Failed to start server: logs means api.registerService either isn't supported or the service isn't being started.

  This is likely a new API (api.registerService) that doesn't exist yet in the current version of OpenClaw. Let me check:


  There it is — registerService pushes to registry.services but there's no code that iterates services and calls .start(). The API exists structurally but the gateway never actually starts the registered services. That's the bug — api.registerService is a no-op in the current OpenClaw version.

  Summary of the problem:

  • Gralkor v2 uses api.registerService to register a service that starts the embedded Graphiti/FalkorDBLite server
  • OpenClaw's plugin subsystem accepts the registration but never calls .start() on it
  • So the Python server never launches, Graphiti stays unreachable at port 8001

  The fix could be either:

  1. In OpenClaw: implement service lifecycle (call service.start() after plugin registration, service.stop() on shutdown)
  2. In Gralkor (workaround): start the server eagerly in register() instead of via registerService

  Which side do you want to fix? Or both?

## Later
