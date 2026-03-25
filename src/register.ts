import { join } from "node:path";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";
import { GRAPHITI_URL, GRAPHITI_PORT } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  createSessionEndHandler,
  type RecallOpts,
  type SessionBufferMap,
  type IdleTimerMap,
} from "./hooks.js";
import { createServerManager, type ServerManager } from "./server-manager.js";
import type { PluginApiBase } from "./types.js";

export type { ServerManager } from "./server-manager.js";

export function registerHooks(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
  opts: RecallOpts = {},
) {
  const buffers: SessionBufferMap = new Map();
  const timers: IdleTimerMap = new Map();

  api.on("before_agent_start", createBeforeAgentStartHandler(client, config, opts));
  api.on("agent_end", createAgentEndHandler(client, config, buffers, timers));
  api.on("session_end", createSessionEndHandler(client, config, buffers, timers));
}

export function registerServerService(
  api: PluginApiBase,
  config: GralkorConfig,
  pluginDir: string,
  serverReady?: ReadyGate,
): ServerManager {
  const dataDir = config.dataDir ?? join(pluginDir, "..", ".gralkor-data");
  const serverDir = join(pluginDir, "server");

  const env: Record<string, string> = {};
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY"]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }

  const manager = createServerManager({
    dataDir,
    serverDir,
    port: GRAPHITI_PORT,
    env,
    llmConfig: config.llm,
    embedderConfig: config.embedder,
    ontologyConfig: config.ontology,
    test: config.test,
  });

  api.registerService({
    id: "gralkor-server",
    async start() {
      try {
        await manager.start();
        serverReady?.resolve();
      } catch (err) {
        console.error("[gralkor] Failed to start server:", err instanceof Error ? err.message : err);
        // Don't throw — degrade gracefully. Tools/hooks handle unreachable Graphiti.
      }
    },
    async stop() {
      await manager.stop();
    },
  });

  return manager;
}

export function registerCli(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
  manager?: ServerManager,
) {
  api.registerCli(
    ({ program }) => {
      const gralkor = program
        .command("gralkor")
        .description("Manage the Gralkor memory backend");

      gralkor
        .command("status")
        .description("Check Graphiti and FalkorDB connection status")
        .action(async () => {
          if (manager) {
            console.log(`Server process: ${manager.isRunning() ? "running" : "stopped"}`);
          }
          try {
            const result = await client.health();
            console.log(
              `Graphiti is ${result.status ?? "reachable"} at ${GRAPHITI_URL}`,
            );
          } catch (err) {
            console.error(
              `Graphiti is unreachable at ${GRAPHITI_URL}: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("search <group_id> <query...>")
        .description("Search the knowledge graph")
        .action(async (groupId: string, query: string[]) => {
          const q = query.join(" ");
          try {
            console.log(`Searching group "${groupId}" for: ${q}`);
            const results = await client.search(q, [groupId], 10);
            console.log(`Found ${results.facts.length} facts in group "${groupId}".`);
            if (results.facts.length === 0) {
              console.log("No results found.");
              return;
            }
            console.log(
              "Facts:\n" +
              results.facts.map((f) => {
                const validity =
                  f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
                return `  - ${f.fact}${validity}`;
              }).join("\n"),
            );
          } catch (err) {
            console.error(
              `Search failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("clear <group_id>")
        .description("Clear the knowledge graph for a group")
        .action(async (groupId: string) => {
          try {
            await client.clearGraph(groupId);
            console.log(`Cleared graph for group "${groupId}".`);
          } catch (err) {
            console.error(
              `Clear failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });
    },
    { commands: ["gralkor"] },
  );
}
