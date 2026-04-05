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
 *   {workspaceDir}/agents/{agentId}/MEMORY.md → group sanitizeGroupId(agentId)
 *   {workspaceDir}/MEMORY.md                  → group of first agent (alphabetically); skipped if no agents
 *   {workspaceDir}/memory/*.md                → group of first agent (alphabetically); skipped if no agents
 *
 * There is no "default" partition. Workspace-level files (MEMORY.md, memory/*.md) are
 * routed to the first agent found in {workspaceDir}/agents/, so they land in a real
 * agent partition. If no agent directories exist yet, workspace-level files are skipped.
 */
export async function discoverFiles(workspaceDir: string): Promise<DiscoveredFile[]> {
  if (!existsSync(workspaceDir)) return [];

  const files: DiscoveredFile[] = [];

  // Discover agent directories first — they determine routing for workspace-level files
  const agentsDir = join(workspaceDir, "agents");
  const agentIds: string[] = [];
  if (existsSync(agentsDir)) {
    try {
      agentIds.push(...(await readdir(agentsDir)).sort());
    } catch { /* ignore */ }
  }

  // Workspace-level files route to the first known agent's group.
  // With no agents registered, workspace-level files are skipped (no default partition).
  const workspaceGroupId = agentIds.length > 0 ? sanitizeGroupId(agentIds[0]) : null;

  if (workspaceGroupId) {
    // Root MEMORY.md
    const rootMemory = join(workspaceDir, "MEMORY.md");
    if (existsSync(rootMemory)) {
      files.push({ absPath: rootMemory, relPath: "MEMORY.md", groupId: workspaceGroupId });
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
              groupId: workspaceGroupId,
            });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // agents/*/MEMORY.md — each to its own group
  for (const agentId of agentIds) {
    const agentMemory = join(agentsDir, agentId, "MEMORY.md");
    if (existsSync(agentMemory)) {
      files.push({
        absPath: agentMemory,
        relPath: `agents/${agentId}/MEMORY.md`,
        groupId: sanitizeGroupId(agentId),
      });
    }
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

  // Preserve all content: everything before old marker position + new content + marker at end
  const body = markerPos === -1
    ? prefix
    : `${prefix}\n${newContent}`;
  await writeFile(file.absPath, `${body}\n${GRALKOR_MARKER}\n`);
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
