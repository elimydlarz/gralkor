import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchNativeMemory, readNativeMemoryFile, resetMemorySDK, type MemorySearchManager } from "./native-memory.js";

// We need to mock the dynamic imports that loadMemorySDK triggers.
// Since they use template-literal paths (`${sdkBase}/memory-core`),
// we can't use vi.mock on them. Instead, we inject a test SDK via
// the module's own loadMemorySDK by pre-populating the cached promise.

const mockManager: MemorySearchManager = {
  search: vi.fn(),
  readFile: vi.fn(),
};

const mockGetMemorySearchManager = vi.fn();
const mockReadAgentMemoryFile = vi.fn();

/**
 * Inject mock SDK by importing the module and calling loadMemorySDK
 * after setting the cached promise via the exported setter.
 */
async function injectMockSDK() {
  const mod = await import("./native-memory.js");
  // Access the internal memorySDKPromise by calling the setter pattern:
  // resetMemorySDK clears it, then we need to set it before any call.
  mod.resetMemorySDK();
  // Now we need to make loadMemorySDK return our mock.
  // The cleanest way: spy on loadMemorySDK.
  vi.spyOn(mod, "loadMemorySDK").mockResolvedValue({
    getMemorySearchManager: mockGetMemorySearchManager,
    readAgentMemoryFile: mockReadAgentMemoryFile,
  });
}

describe("unified-search", () => {
  describe("native memory delegation", () => {
    beforeEach(async () => {
      vi.restoreAllMocks();
      vi.clearAllMocks();

      mockManager.search = vi.fn().mockResolvedValue([
        { path: "memory/notes.md", startLine: 1, endLine: 5, score: 0.9, snippet: "Project uses React", source: "memory" },
      ]);

      mockGetMemorySearchManager.mockResolvedValue({ manager: mockManager });
      mockReadAgentMemoryFile.mockResolvedValue({ text: "File content here", path: "memory/notes.md" });

      await injectMockSDK();
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
