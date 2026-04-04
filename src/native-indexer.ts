import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { sanitizeGroupId } from "./config.js";

export const GRALKOR_MARKER = "<!-- GRALKOR:INDEXED -->";

export interface DiscoveredFile {
  absPath: string;
  relPath: string;
  groupId: string;
}

/**
 * Discover native OpenClaw memory files under workspaceDir.
 * Returns empty list if workspaceDir does not exist.
 *
 * Paths scanned:
 *   {workspaceDir}/MEMORY.md                  → group "default"
 *   {workspaceDir}/memory/*.md                → group "default"
 *   {workspaceDir}/agents/{agentId}/MEMORY.md → group sanitizeGroupId(agentId)
 */
export async function discoverFiles(workspaceDir: string): Promise<DiscoveredFile[]> {
  if (!existsSync(workspaceDir)) return [];

  const files: DiscoveredFile[] = [];

  // Root MEMORY.md
  const rootMemory = join(workspaceDir, "MEMORY.md");
  if (existsSync(rootMemory)) {
    files.push({ absPath: rootMemory, relPath: "MEMORY.md", groupId: "default" });
  }

  // memory/*.md
  const memoryDir = join(workspaceDir, "memory");
  if (existsSync(memoryDir)) {
    try {
      const entries = await readdir(memoryDir);
      for (const entry of entries.sort()) {
        if (entry.endsWith(".md")) {
          files.push({
            absPath: join(memoryDir, entry),
            relPath: `memory/${entry}`,
            groupId: "default",
          });
        }
      }
    } catch { /* ignore */ }
  }

  // agents/*/MEMORY.md
  const agentsDir = join(workspaceDir, "agents");
  if (existsSync(agentsDir)) {
    try {
      const agentDirs = await readdir(agentsDir);
      for (const agentId of agentDirs.sort()) {
        const agentMemory = join(agentsDir, agentId, "MEMORY.md");
        if (existsSync(agentMemory)) {
          files.push({
            absPath: agentMemory,
            relPath: `agents/${agentId}/MEMORY.md`,
            groupId: sanitizeGroupId(agentId),
          });
        }
      }
    } catch { /* ignore */ }
  }

  return files;
}

/**
 * Index a single native memory file into the graph.
 *
 * - No marker: ingest entire content, append marker.
 * - Marker at end: skip (nothing new).
 * - Marker mid-file: ingest content after marker, move marker to end.
 *
 * Returns true if content was ingested, false if skipped.
 * Throws if ingest fails (file is NOT modified on failure).
 */
export async function indexFile(client: GraphitiClient, file: DiscoveredFile): Promise<boolean> {
  const raw = await readFile(file.absPath, "utf8");
  const markerPos = raw.indexOf(GRALKOR_MARKER);

  let newContent: string;
  let prefix: string;

  if (markerPos === -1) {
    newContent = raw.trim();
    prefix = raw.trimEnd();
  } else {
    newContent = raw.slice(markerPos + GRALKOR_MARKER.length).trim();
    prefix = raw.slice(0, markerPos).trimEnd();
  }

  if (!newContent) return false;

  // Ingest first — only write marker if this succeeds
  await client.addEpisode({
    name: file.relPath,
    episode_body: newContent,
    source: "text",
    source_description: "native-memory",
    group_id: file.groupId,
  });

  await writeFile(file.absPath, `${prefix}\n${GRALKOR_MARKER}\n`);
  return true;
}

/**
 * Scan the workspace for native memory files and index any new content
 * into the graph. Fire-and-forget safe — errors per file are caught.
 * Called after serverReady resolves.
 */
export async function runNativeIndexer(
  client: GraphitiClient,
  config: Pick<GralkorConfig, "workspaceDir">,
): Promise<void> {
  const workspaceDir = config.workspaceDir ?? join(homedir(), ".openclaw", "workspace");

  if (!existsSync(workspaceDir)) {
    console.log(`[gralkor] native-index: workspaceDir not found (${workspaceDir}) — skipping`);
    return;
  }

  const files = await discoverFiles(workspaceDir);
  if (files.length === 0) {
    console.log(`[gralkor] native-index: no files found in ${workspaceDir}`);
    return;
  }

  console.log(`[gralkor] native-index: starting — ${files.length} file(s)`);
  let indexed = 0;

  for (const file of files) {
    try {
      const ingested = await indexFile(client, file);
      if (ingested) {
        indexed++;
        console.log(`[gralkor] native-index: indexed ${file.relPath} → ${file.groupId}`);
      }
    } catch (err) {
      console.log(`[gralkor] native-index: error on ${file.relPath} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[gralkor] native-index: done — ${indexed} file(s) ingested`);
}
