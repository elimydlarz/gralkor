import { join } from "node:path";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";
import { GRAPHITI_URL, GRAPHITI_PORT, resolveProviders } from "./config.js";
import {
  createBeforePromptBuildHandler,
  createAgentEndHandler,
  createSessionEndHandler,
  DebouncedFlush,
  flushSessionBuffer,
  type RecallOpts,
  type SessionBuffer,
} from "./hooks.js";
import { resolveSecretEnv } from "./resolve-secrets.js";
import { createServerManager, type ServerManager } from "./server-manager.js";
import type { PluginApiBase } from "./types.js";

export type { ServerManager } from "./server-manager.js";

export function registerHooks(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
  opts: RecallOpts = {},
): DebouncedFlush<SessionBuffer> {
  const debouncer = new DebouncedFlush<SessionBuffer>(config.idleTimeoutMs, (key, buf) =>
    flushSessionBuffer(key, buf, client, { test: config.test }),
  );

  api.on("before_prompt_build", createBeforePromptBuildHandler(client, config, opts));
  api.on("agent_end", createAgentEndHandler(config, debouncer));
  api.on("session_end", createSessionEndHandler(debouncer));

  return debouncer;
}

export function registerServerService(
  api: PluginApiBase,
  config: GralkorConfig,
  pluginDir: string,
  serverReady?: ReadyGate,
): ServerManager {
  const dataDir = config.dataDir ?? join(pluginDir, "..", ".gralkor-data");
  const serverDir = join(pluginDir, "server");

  const manager = createServerManager({
    dataDir,
    serverDir,
    port: GRAPHITI_PORT,
    resolveSecretEnv: () => resolveSecretEnv({
      googleApiKey: config.googleApiKey,
      openaiApiKey: config.openaiApiKey,
      anthropicApiKey: config.anthropicApiKey,
      groqApiKey: config.groqApiKey,
    }),
    llmConfig: config.llm,
    embedderConfig: config.embedder,
    ontologyConfig: config.ontology,
    test: config.test,
  });

  console.log("[gralkor] boot: registering service gralkor-server");
  const registeredAt = Date.now();
  let hostStarted = false;

  api.registerService({
    id: "gralkor-server",
    async start() {
      hostStarted = true;
      clearTimeout(warnTimer);
      clearTimeout(selfStartTimer);
      const waitMs = Date.now() - registeredAt;
      console.log(`[gralkor] boot: service start() called by host (waited ${waitMs}ms after registration)`);
      try {
        await manager.start();
        serverReady?.resolve();
      } catch (err) {
        console.error("[gralkor] boot: service start() failed:", err instanceof Error ? err.message : err);
        throw err;
      }
    },
    async stop() {
      console.log("[gralkor] boot: service stop() called by host");
      await manager.stop();
    },
  });

  // Watchdog: warn at 30s if start() hasn't been called
  const warnTimer = setTimeout(() => {
    if (!hostStarted) {
      console.warn(
        `[gralkor] boot: WARNING — service start() has not been called ${((Date.now() - registeredAt) / 1000).toFixed(0)}s after registration. ` +
        "The host gateway may not be starting registered services. Will self-start at 60s."
      );
    }
  }, 30_000);
  if (warnTimer.unref) warnTimer.unref();

  // Self-start: start the server ourselves at 60s if host hasn't
  const selfStartTimer = setTimeout(async () => {
    if (hostStarted) return;
    console.log("[gralkor] boot: self-starting server (host did not call start() within 60s)");
    try {
      await manager.start();
      serverReady?.resolve();
      console.log("[gralkor] boot: self-start succeeded");
    } catch (err) {
      console.error("[gralkor] boot: self-start failed:", err instanceof Error ? err.message : err);
    }
  }, 60_000);
  if (selfStartTimer.unref) selfStartTimer.unref();

  return manager;
}

export function registerCli(
  api: PluginApiBase,
  client: GraphitiClient,
  config: GralkorConfig,
  manager?: ServerManager,
  dataDir?: string,
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
          // Process state
          if (manager) {
            console.log(`Server process: ${manager.isRunning() ? "running" : "stopped"}`);
          }

          // Config summary
          const { llmProvider, llmModel, embedderProvider, embedderModel } = resolveProviders(config);
          console.log(`LLM: ${llmProvider}/${llmModel}`);
          console.log(`Embedder: ${embedderProvider}/${embedderModel}`);
          console.log(`Auto-capture: ${config.autoCapture.enabled ? "enabled" : "disabled"}`);
          console.log(`Auto-recall: ${config.autoRecall.enabled ? "enabled" : "disabled"} (max ${config.autoRecall.maxResults} results)`);

          // Data directory
          if (dataDir) {
            console.log(`Data directory: ${dataDir}`);
          }

          // Server health + graph stats
          try {
            const result = await client.health();
            console.log(`Graphiti: ${result.status ?? "reachable"} at ${GRAPHITI_URL}`);

            if (result.graph) {
              if (result.graph.connected) {
                console.log(`FalkorDB: connected (${result.graph.node_count ?? 0} nodes, ${result.graph.edge_count ?? 0} edges)`);
              } else {
                console.log(`FalkorDB: disconnected — ${result.graph.error ?? "unknown error"}`);
              }
            }
          } catch (err) {
            console.error(
              `Graphiti: unreachable at ${GRAPHITI_URL} — ${err instanceof Error ? err.message : err}`,
            );
          }

          // Venv state
          if (dataDir) {
            const venvPython = join(dataDir, "venv", "bin", "python");
            try {
              const { execFile } = await import("node:child_process");
              const { promisify } = await import("node:util");
              const execFileAsync = promisify(execFile);
              await execFileAsync(venvPython, ["--version"]);
              console.log(`Python venv: ready`);
            } catch {
              console.log(`Python venv: not found`);
            }
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


    },
    { commands: ["gralkor"] },
  );
}
