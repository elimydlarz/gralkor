import * as oc from "../lib/openclaw.js";
import * as out from "../lib/output.js";

export async function status(): Promise<void> {
  const lines: string[] = [];

  // Plugin info
  let version = "unknown";
  let enabledStr = "unknown";
  try {
    const info = await oc.getPluginInfo("gralkor");
    if (info) {
      version = info.version ?? "unknown";
      enabledStr = info.enabled ? "enabled" : "disabled";
    } else {
      console.log("gralkor is not installed");
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error("Could not query plugin status (is openclaw on PATH?)");
    process.exitCode = 1;
    return;
  }

  lines.push(out.heading(`Gralkor ${version}`));
  lines.push(out.info("Plugin", `installed, ${enabledStr}`));

  // Slot
  try {
    const slot = await oc.getConfig("plugins.slots.memory");
    lines.push(out.info("Slot", slot === "gralkor" ? "memory → gralkor" : `memory → ${slot ?? "(unset)"}`));
  } catch {
    lines.push(out.info("Slot", "unknown"));
  }

  // Server health
  try {
    const resp = await fetch("http://127.0.0.1:8001/health", { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json() as Record<string, unknown>;
      lines.push(out.info("Server", "running (healthy)"));

      // Graph stats — server returns { graph: { connected, node_count, edge_count } }
      if (data.graph && typeof data.graph === "object") {
        const graph = data.graph as Record<string, unknown>;
        if (graph.connected) {
          const nodes = graph.node_count ?? "?";
          const edges = graph.edge_count ?? "?";
          lines.push(out.info("Graph", `${nodes} nodes, ${edges} edges`));
        } else {
          lines.push(out.info("Graph", `disconnected — ${graph.error ?? "unknown error"}`));
        }
      }

      // Data dir if available
      if (typeof data.data_dir === "string") {
        lines.push(out.info("Data dir", data.data_dir));
      }
    } else {
      lines.push(out.info("Server", `unhealthy (HTTP ${resp.status})`));
    }
  } catch {
    lines.push(out.info("Server", "not running"));
  }

  for (const line of lines) console.log(line);
}
