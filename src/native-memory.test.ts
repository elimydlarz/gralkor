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

    describe("when manager is unavailable", () => {
      it("then returns null", async () => {
        mockGetMemorySearchManager.mockResolvedValue({ manager: null, error: "no embedding provider" });

        const result = await searchNativeMemory({}, "test-agent", "query");

        expect(result).toBeNull();
      });
    });

    describe("when native search throws", () => {
      it("then returns null (does not propagate error)", async () => {
        (mockManager.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("SDK exploded"));

        const result = await searchNativeMemory({}, "test-agent", "query");

        expect(result).toBeNull();
      });
    });
  });

  describe("memory_get tool", () => {
    const mockReadAgentMemoryFile = vi.fn();
    const mockSDK: MemorySDK = {
      getMemorySearchManager: vi.fn(),
      readAgentMemoryFile: mockReadAgentMemoryFile,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      setSDKLoader(() => Promise.resolve(mockSDK));
    });

    afterEach(() => {
      resetSDKLoader();
    });

    describe("when path is valid", () => {
      it("then reads file via native memory SDK and returns JSON result", async () => {
        mockReadAgentMemoryFile.mockResolvedValue({ text: "# Notes\nSome content", path: "memory/notes.md" });

        const result = await readNativeMemoryFile({}, "test-agent", "memory/notes.md", { from: 1, lines: 10 });

        expect(mockReadAgentMemoryFile).toHaveBeenCalledWith({
          cfg: {},
          agentId: "test-agent",
          relPath: "memory/notes.md",
          from: 1,
          lines: 10,
        });

        const parsed = JSON.parse(result);
        expect(parsed.text).toBe("# Notes\nSome content");
        expect(parsed.path).toBe("memory/notes.md");
      });
    });

    describe("when read fails", () => {
      it("then returns JSON with error", async () => {
        mockReadAgentMemoryFile.mockRejectedValue(new Error("File not found"));

        const result = await readNativeMemoryFile({}, "test-agent", "memory/missing.md");

        const parsed = JSON.parse(result);
        expect(parsed.path).toBe("memory/missing.md");
        expect(parsed.text).toBe("");
        expect(parsed.error).toBe("File not found");
      });
    });
  });
});
