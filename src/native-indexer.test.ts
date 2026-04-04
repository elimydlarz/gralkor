import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";
import type { GraphitiClient } from "./client.js";

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});
vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { ...fs, default: fs };
});

import {
  GRALKOR_MARKER,
  discoverFiles,
  indexFile,
  runNativeIndexer,
} from "./native-indexer.js";

function mockClient(): GraphitiClient {
  return {
    health: vi.fn(),
    search: vi.fn(),
    addEpisode: vi.fn().mockResolvedValue({ uuid: "ep-1", name: "test", content: "", source_description: "", group_id: "default", created_at: "" }),
    ingestEpisode: vi.fn(),
    buildIndices: vi.fn(),
    buildCommunities: vi.fn(),
  } as unknown as GraphitiClient;
}

beforeEach(() => {
  vol.reset();
});

// ── discoverFiles ──────────────────────────────────────────────────────────

describe("discoverFiles", () => {
  describe("when workspaceDir does not exist", () => {
    it("then returns empty list", async () => {
      const files = await discoverFiles("/no/such/dir");
      expect(files).toEqual([]);
    });
  });

  describe("then finds {workspaceDir}/MEMORY.md with group default", () => {
    it("finds MEMORY.md", async () => {
      vol.fromJSON({ "/ws/MEMORY.md": "# Notes\nHello world" });
      const files = await discoverFiles("/ws");
      expect(files).toContainEqual(expect.objectContaining({ relPath: "MEMORY.md", groupId: "default" }));
    });
  });

  describe("then finds {workspaceDir}/memory/*.md with group default", () => {
    it("finds daily memory files", async () => {
      vol.fromJSON({
        "/ws/memory/2026-01-01.md": "day one",
        "/ws/memory/2026-01-02.md": "day two",
      });
      const files = await discoverFiles("/ws");
      const relPaths = files.map(f => f.relPath);
      expect(relPaths).toContain("memory/2026-01-01.md");
      expect(relPaths).toContain("memory/2026-01-02.md");
      expect(files.every(f => f.groupId === "default")).toBe(true);
    });
  });

  describe("then finds {workspaceDir}/agents/{id}/MEMORY.md with group sanitizeGroupId(id)", () => {
    it("finds per-agent MEMORY.md and uses sanitized agentId as group", async () => {
      vol.fromJSON({
        "/ws/agents/my-agent/MEMORY.md": "# Agent memory",
        "/ws/agents/other_agent/MEMORY.md": "# Other",
      });
      const files = await discoverFiles("/ws");
      expect(files).toContainEqual(expect.objectContaining({
        relPath: "agents/my-agent/MEMORY.md",
        groupId: "my_agent",
      }));
      expect(files).toContainEqual(expect.objectContaining({
        relPath: "agents/other_agent/MEMORY.md",
        groupId: "other_agent",
      }));
    });
  });
});

// ── indexFile ──────────────────────────────────────────────────────────────

describe("indexFile", () => {
  describe("when file has no marker", () => {
    it("then ingests entire file content", async () => {
      vol.fromJSON({ "/ws/MEMORY.md": "# About\nI am a test user.\n" });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await indexFile(client, file);

      expect(client.addEpisode).toHaveBeenCalledWith(expect.objectContaining({
        episode_body: "# About\nI am a test user.",
        group_id: "default",
        source: "text",
        source_description: "native-memory",
      }));
    });

    it("and appends marker at end of file", async () => {
      vol.fromJSON({ "/ws/MEMORY.md": "# About\nI am a test user.\n" });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await indexFile(client, file);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile("/ws/MEMORY.md", "utf8");
      expect(content).toContain(GRALKOR_MARKER);
      expect(content.indexOf("# About")).toBeLessThan(content.indexOf(GRALKOR_MARKER));
    });
  });

  describe("when file has marker at end (nothing after it)", () => {
    it("then skips ingest", async () => {
      vol.fromJSON({ "/ws/MEMORY.md": `# About\nFully indexed.\n${GRALKOR_MARKER}\n` });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      const result = await indexFile(client, file);

      expect(client.addEpisode).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("and does not modify the file", async () => {
      const original = `# About\nFully indexed.\n${GRALKOR_MARKER}\n`;
      vol.fromJSON({ "/ws/MEMORY.md": original });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await indexFile(client, file);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile("/ws/MEMORY.md", "utf8");
      expect(content).toBe(original);
    });
  });

  describe("when file has marker mid-file (new content after it)", () => {
    it("then ingests only content after the marker", async () => {
      vol.fromJSON({
        "/ws/MEMORY.md": `# Old\nOld content.\n${GRALKOR_MARKER}\n# New\nNew content added.\n`,
      });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await indexFile(client, file);

      expect(client.addEpisode).toHaveBeenCalledWith(expect.objectContaining({
        episode_body: "# New\nNew content added.",
      }));
      const call = vi.mocked(client.addEpisode).mock.calls[0][0];
      expect(call.episode_body).not.toContain("Old content");
    });

    it("and moves marker to new end of file", async () => {
      vol.fromJSON({
        "/ws/MEMORY.md": `# Old\nOld content.\n${GRALKOR_MARKER}\n# New\nNew content added.\n`,
      });
      const client = mockClient();
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await indexFile(client, file);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile("/ws/MEMORY.md", "utf8");
      // Marker is now at the end (after all content)
      const markerPos = content.lastIndexOf(GRALKOR_MARKER);
      const afterMarker = content.slice(markerPos + GRALKOR_MARKER.length).trim();
      expect(afterMarker).toBe("");
      // All original content preserved before marker
      expect(content).toContain("Old content");
      expect(content).toContain("New content added");
    });
  });

  describe("when ingest fails", () => {
    it("then does not move the marker (file left unchanged)", async () => {
      const original = `# Old\nContent.\n${GRALKOR_MARKER}\n# New\nNew stuff.\n`;
      vol.fromJSON({ "/ws/MEMORY.md": original });
      const client = mockClient();
      vi.mocked(client.addEpisode).mockRejectedValue(new Error("server error"));
      const file = { absPath: "/ws/MEMORY.md", relPath: "MEMORY.md", groupId: "default" };

      await expect(indexFile(client, file)).rejects.toThrow("server error");

      const { readFile } = await import("node:fs/promises");
      const content = await readFile("/ws/MEMORY.md", "utf8");
      expect(content).toBe(original);
    });
  });
});

// ── runNativeIndexer ───────────────────────────────────────────────────────

describe("runNativeIndexer", () => {
  describe("when workspaceDir does not exist", () => {
    it("then skips gracefully without error", async () => {
      const client = mockClient();
      await expect(
        runNativeIndexer(client, { dataDir: "/data", workspaceDir: "/no/such/dir" } as any)
      ).resolves.toBeUndefined();
      expect(client.addEpisode).not.toHaveBeenCalled();
    });
  });

  describe("when a file errors", () => {
    it("then logs error and continues with remaining files", async () => {
      vol.fromJSON({
        "/ws/MEMORY.md": "# First\nFirst content.",
        "/ws/memory/second.md": "# Second\nSecond content.",
      });
      const client = mockClient();
      // First file fails, second should still be processed
      vi.mocked(client.addEpisode)
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue({ uuid: "ep-2", name: "", content: "", source_description: "", group_id: "", created_at: "" });

      await runNativeIndexer(client, { dataDir: "/data", workspaceDir: "/ws" } as any);

      expect(client.addEpisode).toHaveBeenCalledTimes(2);
    });
  });
});
