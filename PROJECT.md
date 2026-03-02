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

## Later
