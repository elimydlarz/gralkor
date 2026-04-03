import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerCli, registerServerService, buildSecretEnv } from "./register.js";
import type { PluginApiBase } from "./types.js";
import type { GraphitiClient } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";
import type { ServerManager } from "./server-manager.js";

// Mock createServerManager so we don't spawn real processes
vi.mock("./server-manager.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./server-manager.js")>();
  return {
    ...orig,
    createServerManager: vi.fn(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
    })),
  };
});

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
      client.search.mockResolvedValue(emptySearchResults());

      const searchAction = actions.get("search <group_id> <query...>");
      expect(searchAction).toBeDefined();

      await searchAction!("my-agent", ["hello", "world"]);

      expect(client.search).toHaveBeenCalledWith("hello world", ["my-agent"], 10);
    });

    it("displays facts from results", async () => {
      client.search.mockResolvedValue({
        ...emptySearchResults(),
        facts: [{ fact: "Alice likes cats", invalid_at: null }],
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("agent-42", ["Alice"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Alice likes cats");
      expect(output).toContain('group "agent-42"');

      logSpy.mockRestore();
    });

    it("shows 'No results found.' when graph returns nothing", async () => {
      client.search.mockResolvedValue(emptySearchResults());

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("empty-agent", ["test"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("No results found.");

      logSpy.mockRestore();
    });

    it("handles search errors gracefully", async () => {
      client.search.mockRejectedValue(new Error("connection refused"));

      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const searchAction = actions.get("search <group_id> <query...>");
      await searchAction!("agent-1", ["test"]);

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Search failed: connection refused");

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

      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
      search: vi.fn().mockResolvedValue({ facts: [], nodes: [], episodes: [], communities: [] }),
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

describe("startup", () => {
  let api: PluginApiBase;
  let serverReady: ReadyGate;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    serverReady = { isReady: vi.fn().mockReturnValue(false), resolve: vi.fn() };
    api = {
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    } as unknown as PluginApiBase;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const config: GralkorConfig = {
    autoCapture: { enabled: false },
    autoRecall: { enabled: false, maxResults: 10 },
    idleTimeoutMs: 300_000,
    dataDir: "/tmp/gralkor-test-data",
  };

  it("starts the server as fire-and-forget during registration", async () => {
    const { createServerManager } = await import("./server-manager.js");
    const mockStart = vi.fn().mockResolvedValue(undefined);
    (createServerManager as ReturnType<typeof vi.fn>).mockReturnValue({
      start: mockStart,
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    });

    registerServerService(api, config, "/fake/plugin", serverReady);

    // Fire-and-forget is async — flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(mockStart).toHaveBeenCalled();
  });

  it("when self-start succeeds, serverReady resolves", async () => {
    const { createServerManager } = await import("./server-manager.js");
    (createServerManager as ReturnType<typeof vi.fn>).mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    });

    registerServerService(api, config, "/fake/plugin", serverReady);
    await new Promise((r) => setTimeout(r, 0));

    expect(serverReady.resolve).toHaveBeenCalled();
  });

  it("when self-start fails, logs error and serverReady remains unresolved", async () => {
    const { createServerManager } = await import("./server-manager.js");
    (createServerManager as ReturnType<typeof vi.fn>).mockReturnValue({
      start: vi.fn().mockRejectedValue(new Error("uv not found")),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    });

    registerServerService(api, config, "/fake/plugin", serverReady);
    await new Promise((r) => setTimeout(r, 0));

    const errors = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errors).toContain("self-start failed");
    expect(errors).toContain("uv not found");
    expect(serverReady.resolve).not.toHaveBeenCalled();
  });
});

describe("secret-resolution", () => {
  const base: GralkorConfig = {
    autoCapture: { enabled: true },
    autoRecall: { enabled: true, maxResults: 10 },
    idleTimeoutMs: 300_000,
  };

  describe("when config contains a plaintext API key string", () => {
    it("then env var is set to that string (trimmed)", () => {
      const env = buildSecretEnv({ ...base, googleApiKey: "  sk-abc123  " });
      expect(env.GOOGLE_API_KEY).toBe("sk-abc123");
    });
  });

  describe("when config value is empty or whitespace", () => {
    it("then env var is not set", () => {
      const env = buildSecretEnv({ ...base, googleApiKey: "   ", openaiApiKey: "" });
      expect(env.GOOGLE_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
    });
  });

  describe("when config value is undefined or absent", () => {
    it("then env var is not set", () => {
      const env = buildSecretEnv({ ...base, googleApiKey: undefined });
      expect(env.GOOGLE_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
    });
  });

  it("then env vars are built synchronously and passed to the server manager", () => {
    const env = buildSecretEnv({
      ...base,
      googleApiKey: "gk-123",
      openaiApiKey: "sk-456",
      anthropicApiKey: "ak-789",
      groqApiKey: "gsk-012",
    });
    expect(env).toEqual({
      GOOGLE_API_KEY: "gk-123",
      OPENAI_API_KEY: "sk-456",
      ANTHROPIC_API_KEY: "ak-789",
      GROQ_API_KEY: "gsk-012",
    });
  });

  it("then process.env is not read for API keys", () => {
    process.env.GOOGLE_API_KEY = "from-env";
    try {
      const env = buildSecretEnv(base);
      expect(env.GOOGLE_API_KEY).toBeUndefined();
    } finally {
      delete process.env.GOOGLE_API_KEY;
    }
  });
});
