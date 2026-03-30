import { describe, it, expect, vi, beforeEach } from "vitest";

const mockManager = {
  search: vi.fn(),
  readFile: vi.fn(),
};

const mockGetMemorySearchManager = vi.fn();
const mockReadAgentMemoryFile = vi.fn();

// Mock the dynamic SDK imports by intercepting loadMemorySDK's import() calls.
// Since loadMemorySDK uses template-literal dynamic imports, we mock the module
// itself to replace loadMemorySDK with one that returns our mocks.
vi.mock("./native-memory.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./native-memory.js")>();
  return {
    ...original,
    loadMemorySDK: vi.fn().mockResolvedValue({
      getMemorySearchManager: mockGetMemorySearchManager,
      readAgentMemoryFile: mockReadAgentMemoryFile,
    }),
  };
});

import { searchNativeMemory, readNativeMemoryFile } from "./native-memory.js";

describe("unified-search", () => {
  describe("native memory delegation", () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mockManager.search.mockResolvedValue([
        { path: "memory/notes.md", startLine: 1, endLine: 5, score: 0.9, snippet: "Project uses React", source: "memory" },
      ]);
      mockManager.readFile.mockResolvedValue({ text: "File content", path: "memory/notes.md" });

      mockGetMemorySearchManager.mockResolvedValue({ manager: mockManager });
      mockReadAgentMemoryFile.mockResolvedValue({ text: "File content here", path: "memory/notes.md" });
    });

    describe("when manager is available", () => {
      it("then calls manager.search with query and options and returns JSON with results array", async () => {
        const result = await searchNativeMemory({}, "test-agent", "React patterns", {
          maxResults: 5,
          sessionKey: "session-1",
        });

        expect(mockGetMemorySearchManager).toHaveBeenCalledWith({
          cfg: {},
          agentId: "test-agent",
        });
        expect(mockManager.search).toHaveBeenCalledWith("React patterns", {
          maxResults: 5,
          sessionKey: "session-1",
        });

        const parsed = JSON.parse(result!);
        expect(parsed.results).toHaveLength(1);
        expect(parsed.results[0].snippet).toBe("Project uses React");
      });
    });
  });
});
