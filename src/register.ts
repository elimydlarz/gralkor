import { join } from "node:path";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { GRAPHITI_URL, GRAPHITI_PORT } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  type NativeSearchFn,
} from "./hooks.js";
import { createServerManager, type ServerManager } from "./server-manager.js";
import type { PluginApiBase } from "./types.js";

export type { ServerManager } from "./server-manager.js";

export function registerHooks(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
  getNativeSearch?: () => NativeSearchFn | null,
) {
  api.on("before_agent_start", createBeforeAgentStartHandler(client, config, setGroupId, getNativeSearch));
  api.on("agent_end", createAgentEndHandler(client, config));
}

export function registerServerService(
  api: PluginApiBase,
  config: GralkorConfig,
  pluginDir: string,
): ServerManager {
  const dataDir = config.dataDir ?? join(pluginDir, ".gralkor-data");
  const serverDir = join(pluginDir, "server");
  const configPath = join(pluginDir, "config.yaml");

  const env: Record<string, string> = {};
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY"]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }

  const manager = createServerManager({
    dataDir,
    serverDir,
    port: GRAPHITI_PORT,
    env,
    configPath,
  });

  api.registerService({
    id: "gralkor-server",
    async start() {
      try {
        await manager.start();
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
            console.log(
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
            const [facts, nodes] = await Promise.all([
              client.searchFacts(q, [groupId], 10),
              client.searchNodes(q, [groupId], 10),
            ]);
            console.log(`Found ${facts.length} facts, ${nodes.length} entities in group "${groupId}".`);
            if (facts.length === 0 && nodes.length === 0) {
              console.log("No results found.");
              return;
            }
            const sections: string[] = [];
            if (facts.length > 0) {
              sections.push(
                "Facts (knowledge graph):\n" +
                facts.map((f) => {
                  const validity =
                    f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
                  return `  - ${f.fact}${validity}`;
                }).join("\n"),
              );
            }
            if (nodes.length > 0) {
              sections.push(
                "Entities (knowledge graph):\n" +
                nodes.map((n) => `  - ${n.name}: ${n.summary}`).join("\n"),
              );
            }
            console.log(sections.join("\n\n"));
          } catch (err) {
            console.log(
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
            console.log(
              `Clear failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });
    },
    { commands: ["gralkor"] },
  );
}
