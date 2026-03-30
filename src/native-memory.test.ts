import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchNativeMemory,
  readNativeMemoryFile,
  setSDKLoader,
  resetSDKLoader,
  type MemorySearchManager,
  type MemorySDK,
} from "./native-memory.js";

describe("unified-search", () => {
  describe("native memory delegation", () => {
    const mockManager: MemorySearchManager = {
      search: vi.fn(),
      readFile: vi.fn(),
    };
    const mockGetMemorySearchManager = vi.fn();
    const mockReadAgentMemoryFile = vi.fn();
    const mockSDK: MemorySDK = {
      getMemorySearchManager: mockGetMemorySearchManager,
      readAgentMemoryFile: mockReadAgentMemoryFile,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      setSDKLoader(() => Promise.resolve(mockSDK));

      (mockManager.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: "memory/notes.md", startLine: 1, endLine: 5, score: 0.9, snippet: "Project uses React", source: "memory" },
      ]);

      mockGetMemorySearchManager.mockResolvedValue({ manager: mockManager });
      mockReadAgentMemoryFile.mockResolvedValue({ text: "File content here", path: "memory/notes.md" });
    });

    afterEach(() => {
      resetSDKLoader();
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
