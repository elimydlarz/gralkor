# @susu-eng/gralkor-ts

TypeScript adapter for [Gralkor](https://github.com/elimydlarz/gralkor) — a temporally-aware knowledge-graph memory service (Graphiti + FalkorDB) wrapped as a Python/FastAPI server.

Gives you an HTTP client, an in-memory test twin, a boot-readiness helper, and a Python-subprocess server manager — **with the Python server bundled**. `createServerManager({ dataDir, port, version })` spawns the packaged server without you needing to supply a path. Mirror of the `:gralkor_ex` Hex package for the BEAM. For OpenClaw agents use [`@susu-eng/openclaw-gralkor`](https://www.npmjs.com/package/@susu-eng/openclaw-gralkor); this package is what it builds on.

## Install

```bash
pnpm add @susu-eng/gralkor-ts
```

## Usage

```ts
import { GralkorHttpClient, waitForHealth, createServerManager } from "@susu-eng/gralkor-ts";

// If your process owns the Python server, spawn it first.
// serverDir defaults to the bundled copy inside this package — only
// override it for a development checkout of gralkor/server/.
const manager = createServerManager({
  dataDir: process.env.GRALKOR_DATA_DIR!,
  port: 4000,
  version: "1.0.0",
});
await manager.start();

// Talk to the server:
const client = new GralkorHttpClient({ baseUrl: "http://127.0.0.1:4000" });
await waitForHealth(client);

const recall = await client.recall("my_group", "session-abc", "what do you remember about X?");
if ("ok" in recall && recall.ok !== null) {
  console.log(recall.ok); // memory block
}

await client.capture("session-abc", "my_group", {
  user_query: "hi",
  assistant_answer: "hello",
  events: [],
});
```

## Return shape

Every client method returns `Result<T, E>`:

```ts
type Result<T, E = unknown> = { ok: T } | { error: E };
```

Recoverable errors surface as `{ error: ... }`. Unrecoverable misuse (blank
`session_id`, missing `baseUrl`) throws. Matches the Elixir adapter's
`{:ok, ...} | {:error, reason}` ↔ `raise` split.

## Testing

Import the in-memory twin from the `/testing` subpath:

```ts
import { GralkorInMemoryClient } from "@susu-eng/gralkor-ts/testing";

const client = new GralkorInMemoryClient();
client.setResponse("recall", { ok: "<gralkor-memory>known fact</gralkor-memory>" });
client.setResponse("capture", { ok: true });

// ... run code under test against `client` ...

expect(client.recalls).toEqual([["my_group", "session-abc", "query"]]);
```

`GralkorInMemoryClient` satisfies the full `GralkorClient` interface and passes the shared port contract (see `test/contract/gralkor-client.contract.ts`). It's not a mock — it's a real implementation that stores canned responses and records every call.

## What this package does (and doesn't)

This package is a **thin adapter**. It doesn't know about auto-recall, auto-capture, tools, agents, ReAct, or any harness-specific concepts. All of those live in the consumer:

- **OpenClaw agents** → [`@susu-eng/openclaw-gralkor`](https://www.npmjs.com/package/@susu-eng/openclaw-gralkor)
- **Jido (BEAM) agents** → [`:jido_gralkor` on Hex](https://hex.pm/packages/jido_gralkor) (uses the BEAM-side `:gralkor`, not this one)

Capture buffering, idle flush, per-turn distillation, and LLM interpretation all happen server-side. This adapter just posts turns and fetches recall results.

## License

MIT.
