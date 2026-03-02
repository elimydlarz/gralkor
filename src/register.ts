import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId, GRAPHITI_URL } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  type NativeSearchFn,
} from "./hooks.js";
import type { PluginApiBase } from "./types.js";

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

export function registerHealthService(
  api: PluginApiBase,
  client: GraphitiClient,
) {
  let timer: ReturnType<typeof setInterval> | undefined;

  api.registerService({
    id: "gralkor-health",
    start() {
      timer = setInterval(async () => {
        try {
          await client.health();
        } catch (err) {
          console.warn(
            "[gralkor] Graphiti health check failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }, 60_000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  });
}

export function registerCli(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
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
