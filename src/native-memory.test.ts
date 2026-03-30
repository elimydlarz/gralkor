import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchNativeMemory, readNativeMemoryFile, resetMemorySDK } from "./native-memory.js";

// Mock the SDK module loader
vi.mock("./native-memory.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./native-memory.js")>();
  return {
    ...original,
  };
});

describe("unified-search", () => {
  describe("native memory delegation", () => {
    let mockManager: {
      search: ReturnType<typeof vi.fn>;
      readFile: ReturnType<typeof vi.fn>;
    };
    let mockGetMemorySearchManager: ReturnType<typeof vi.fn>;
    let mockReadAgentMemoryFile: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      resetMemorySDK();

      mockManager = {
        search: vi.fn().mockResolvedValue([
          { path: "memory/notes.md", startLine: 1, endLine: 5, score: 0.9, snippet: "Project uses React", source: "memory" },
        ]),
        readFile: vi.fn(),
      };

      mockGetMemorySearchManager = vi.fn().mockResolvedValue({
        manager: mockManager,
      });

      mockReadAgentMemoryFile = vi.fn().mockResolvedValue({
        text: "File content here",
        path: "memory/notes.md",
      });
    });

    describe("when manager is available", () => {
      it("then calls manager.search with query and options and returns JSON with results array", async () => {
        // Override loadMemorySDK to return our mocks
        const mod = await import("./native-memory.js");
        vi.spyOn(mod, "loadMemorySDK").mockResolvedValue({
          getMemorySearchManager: mockGetMemorySearchManager,
          readAgentMemoryFile: mockReadAgentMemoryFile,
        });

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
