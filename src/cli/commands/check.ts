import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as oc from "../lib/openclaw.js";
import * as out from "../lib/output.js";
import { PROVIDER_ENV_KEYS, DEFAULT_LLM_PROVIDER, DEFAULT_EMBEDDER_PROVIDER } from "../../config.js";

const execFileAsync = promisify(execFile);

export async function check(): Promise<void> {
  const lines: string[] = [];
  let hasFailure = false;

  const fail = (label: string, message: string) => {
    lines.push(out.fail(label, message));
    hasFailure = true;
  };

  // 1. openclaw
  try {
    const version = await oc.checkOpenclaw();
    lines.push(out.ok("openclaw", `found (${version})`));
  } catch {
    fail("openclaw", "not found on PATH");
  }

  // 2. uv
  try {
    const { stdout } = await execFileAsync("uv", ["--version"]);
    lines.push(out.ok("uv", `found (${stdout.trim()})`));
  } catch {
    fail("uv", "not found — install: curl -LsSf https://astral.sh/uv/install.sh | sh");
  }

  // 3. Plugin installed
  let llmProvider = DEFAULT_LLM_PROVIDER;
  let embedderProvider = DEFAULT_EMBEDDER_PROVIDER;
  try {
    const info = await oc.getPluginInfo("gralkor");
    if (info) {
      lines.push(out.ok("plugin", `installed (${info.version ?? "unknown version"})`));
      if (!info.enabled) {
        lines.push(out.warn("plugin", "installed but not enabled"));
      }
    } else {
      fail("plugin", "gralkor not installed");
    }
  } catch {
    fail("plugin", "could not check plugin status");
  }

  // 4. Read actual configured providers from OpenClaw config
  try {
    const configuredLlm = await oc.getConfig("plugins.entries.gralkor.config.llm.provider");
    if (configuredLlm) llmProvider = configuredLlm;
  } catch { /* use default */ }

  try {
    const configuredEmbedder = await oc.getConfig("plugins.entries.gralkor.config.embedder.provider");
    if (configuredEmbedder) embedderProvider = configuredEmbedder;
  } catch { /* use default */ }

  // 5. Slot
  try {
    const slot = await oc.getConfig("plugins.slots.memory");
    if (slot === "gralkor") {
      lines.push(out.ok("slot", "memory → gralkor"));
    } else {
      fail("slot", `memory → ${slot ?? "(unset)"}, expected gralkor`);
    }
  } catch {
    lines.push(out.skip("slot", "could not read config"));
  }

  // 6. LLM provider key
  const llmEnvKey = PROVIDER_ENV_KEYS[llmProvider];
  if (llmEnvKey) {
    if (process.env[llmEnvKey]) {
      lines.push(out.ok("LLM provider", `${llmProvider} (${llmEnvKey} set)`));
    } else {
      fail("LLM provider", `${llmProvider} requires ${llmEnvKey}`);
    }
  } else {
    lines.push(out.warn("LLM provider", `unknown provider '${llmProvider}'`));
  }

  // 7. Embedder provider key
  const embedderEnvKey = PROVIDER_ENV_KEYS[embedderProvider];
  if (embedderEnvKey) {
    if (embedderEnvKey === llmEnvKey) {
      // Already checked above, skip duplicate
    } else if (process.env[embedderEnvKey]) {
      lines.push(out.ok("Embedder provider", `${embedderProvider} (${embedderEnvKey} set)`));
    } else {
      fail("Embedder provider", `${embedderProvider} requires ${embedderEnvKey}`);
    }
  }

  // 8. Server health
  try {
    const resp = await fetch("http://127.0.0.1:8001/health", { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      lines.push(out.ok("server", "healthy"));
    } else {
      lines.push(out.warn("server", `unhealthy (HTTP ${resp.status})`));
    }
  } catch {
    lines.push(out.skip("server", "not running"));
  }

  for (const line of lines) console.log(line);
  if (hasFailure) process.exitCode = 1;
}
