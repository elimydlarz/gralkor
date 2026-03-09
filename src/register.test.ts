import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCli } from "./register.js";
import type { PluginApiBase } from "./types.js";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import type { ServerManager } from "./server-manager.js";

/**
 * Build a mock Commander chain that captures subcommands and their action handlers.
 * Returns both the mock `program` and a map of action handlers keyed by command name.
 */
function createMockProgram() {
  const actions = new Map<string, (...args: any[]) => Promise<void>>();

  const mockSubcommand = (cmdName: string) => ({
    description() { return this; },
    action(fn: (...args: any[]) => Promise<void>) {
      actions.set(cmdName, fn);
      return this;
    },
  });

  const mockGralkorCmd = {
    command(name: string) {
      return mockSubcommand(name);
    },
  };

  const program = {
    command(name: string) {
      expect(name).toBe("gralkor");
      return { description() { return mockGralkorCmd; } };
    },
  };

  return { program, actions };
}

describe("registerCli", () => {
  let client: {
    health: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    clearGraph: ReturnType<typeof vi.fn>;
  };
  let config: GralkorConfig;
  let api: PluginApiBase;
  let actions: Map<string, (...args: any[]) => Promise<void>>;

  const emptySearchResults = () => ({ facts: [], nodes: [], episodes: [], communities: [] });

  beforeEach(() => {
    client = {
      health: vi.fn(),
      search: vi.fn().mockResolvedValue(emptySearchResults()),
      clearGraph: vi.fn().mockResolvedValue(undefined),
    };
    config = {
      autoCapture: { enabled: true },
      autoRecall: { enabled: true, maxResults: 10 },
    };

    const { program, actions: a } = createMockProgram();
    actions = a;

    api = {
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn().mockImplementation((registrar: any) => {
        registrar({ program });
      }),
    } as unknown as PluginApiBase;

    registerCli(api, client as unknown as GraphitiClient, config, undefined);
  });

  describe("search command", () => {
    it("passes group_id to client.search", async () => {
      client.search.mockResolvedValue([]);

      const searchAction = actions.get("search <group_id> <query...>");
      expect(searchAction).toBeDefined();

      await searchAction!("my-agent", ["hello", "world"]);

      expect(client.search).toHaveBeenCalledWith("hello world", ["my-agent"], 10);
    });

    it("displays facts from results", async () => {
      client.search.mockResolvedValue([
        { fact: "Alice likes cats", invalid_at: null },
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("agent-42", ["Alice"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Alice likes cats");
      expect(output).toContain('group "agent-42"');

      logSpy.mockRestore();
    });

    it("shows 'No results found.' when graph returns nothing", async () => {
      client.search.mockResolvedValue([]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("empty-agent", ["test"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("No results found.");

      logSpy.mockRestore();
    });

    it("handles search errors gracefully", async () => {
      client.search.mockRejectedValue(new Error("connection refused"));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("agent-1", ["test"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Search failed: connection refused");

      logSpy.mockRestore();
    });
  });

  describe("clear command", () => {
    it("passes group_id to client.clearGraph", async () => {
      const clearAction = actions.get("clear <group_id>");
      expect(clearAction).toBeDefined();

      await clearAction!("my-agent");

      expect(client.clearGraph).toHaveBeenCalledWith("my-agent");
    });

    it("logs success with the group ID", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const clearAction = actions.get("clear <group_id>");
      await clearAction!("agent-42");

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain('Cleared graph for group "agent-42"');

      logSpy.mockRestore();
    });

    it("handles clear errors gracefully", async () => {
      client.clearGraph.mockRejectedValue(new Error("timeout"));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const clearAction = actions.get("clear <group_id>");
      await clearAction!("agent-1");

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Clear failed: timeout");

      logSpy.mockRestore();
    });
  });

  describe("status command", () => {
    it("reports healthy status", async () => {
      client.health.mockResolvedValue({ status: "ok" });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const statusAction = actions.get("status");
      await statusAction!();

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("ok");

      logSpy.mockRestore();
    });

    it("reports unreachable on error", async () => {
      client.health.mockRejectedValue(new Error("ECONNREFUSED"));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const statusAction = actions.get("status");
      await statusAction!();

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("unreachable");
      expect(output).toContain("ECONNREFUSED");

      logSpy.mockRestore();
    });
  });
});

describe("registerCli with ServerManager", () => {
  it("shows server process status when manager is provided", async () => {
    const client = {
      health: vi.fn().mockResolvedValue({ status: "ok" }),
      searchFacts: vi.fn().mockResolvedValue([]),
      clearGraph: vi.fn(),
    };
    const config: GralkorConfig = {
      autoCapture: { enabled: true },
      autoRecall: { enabled: true, maxResults: 10 },
    };
    const manager: ServerManager = {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(true),
    };

    const { program, actions } = createMockProgram();
    const api = {
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn().mockImplementation((registrar: any) => {
        registrar({ program });
      }),
    } as unknown as PluginApiBase;

    registerCli(api, client as unknown as GraphitiClient, config, manager);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const statusAction = actions.get("status");
    await statusAction!();

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Server process: running");

    logSpy.mockRestore();
  });
});
