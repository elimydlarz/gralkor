import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { SHARED_GROUP_ID } from "./config.js";
import {
  createBeforeAgentStartHook,
  createAgentEndHook,
} from "./hooks.js";

interface PluginApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHook(hook: {
    name: string;
    execute: (ctx: any) => Promise<any>;
  }): void;
  registerService(service: {
    name: string;
    interval: number;
    execute: () => Promise<void>;
  }): void;
  registerCli(
    registrar: (ctx: {
      program: any;
      config: any;
      workspaceDir?: string;
      logger: any;
    }) => void | Promise<void>,
    opts?: { commands?: string[] },
  ): void;
}

export function registerHooks(
  api: PluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
) {
  api.registerHook(createBeforeAgentStartHook(client, config));
  api.registerHook(createAgentEndHook(client, config));
}

export function registerHealthService(
  api: PluginApi,
  client: GraphitiClient,
) {
  api.registerService({
    name: "gralkor-health",
    interval: 60_000,
    async execute() {
      try {
        await client.health();
      } catch (err) {
        console.warn(
          "[gralkor] Graphiti health check failed:",
          err instanceof Error ? err.message : err,
        );
      }
    },
  });
}

export function registerCli(
  api: PluginApi,
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
              `Graphiti is ${result.status ?? "reachable"} at ${config.graphitiUrl}`,
            );
          } catch (err) {
            console.log(
              `Graphiti is unreachable at ${config.graphitiUrl}: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("search <query...>")
        .description("Search the shared knowledge graph")
        .action(async (query: string[]) => {
          const q = query.join(" ");
          try {
            const facts = await client.searchFacts(q, [SHARED_GROUP_ID], 10);
            if (facts.length === 0) {
              console.log("No results found.");
              return;
            }
            console.log(facts.map((f) => `- ${f.fact}`).join("\n"));
          } catch (err) {
            console.log(
              `Search failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("clear [group_id]")
        .description("Clear the knowledge graph for a group")
        .action(async (groupId?: string) => {
          const id = groupId ?? SHARED_GROUP_ID;
          try {
            await client.clearGraph(id);
            console.log(`Cleared graph for group "${id}".`);
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
