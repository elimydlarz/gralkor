import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Verify the module's export shape — this is the test that would have
// caught the "entry.register is not a function" bug.
describe("plugin export shape", () => {
  it("exports register as a named function", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.register).toBe("function");
  });

  it("exports required metadata fields", async () => {
    const mod = await import("./index.js");
    expect(mod.id).toBe("gralkor");
    expect(mod.name).toBe("Gralkor Memory");
    expect(typeof mod.description).toBe("string");
    expect(mod.kind).toBe("memory");
    expect(mod.configSchema).toBeDefined();
    expect(mod.configSchema.type).toBe("object");
  });

  it("exports unified tools list", async () => {
    const mod = await import("./index.js");
    expect(mod.tools).toEqual(["memory_search", "memory_add"]);
  });

  it("default export has register as a function (OpenClaw CLI loader)", async () => {
    const mod = await import("./index.js");
    const entry = mod.default;
    expect(entry).toBeDefined();
    expect(typeof entry.register).toBe("function");
  });

  it("default export includes all metadata fields", async () => {
    const mod = await import("./index.js");
    const entry = mod.default;
    expect(entry.id).toBe("gralkor");
    expect(entry.name).toBe("Gralkor Memory");
    expect(typeof entry.description).toBe("string");
    expect(entry.kind).toBe("memory");
    expect(entry.configSchema).toBeDefined();
  });
});

describe("register()", () => {
  let api: {
    pluginConfig?: Record<string, unknown>;
    registerTool: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    registerService: ReturnType<typeof vi.fn>;
    registerCli: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const { _resetForTesting } = await import("./index.js");
    _resetForTesting();

    api = {
      pluginConfig: { dataDir: "/tmp/gralkor-test-data" },
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    };
  });

  it("registers full plugin", async () => {
    const { register } = await import("./index.js");

    register(api);

    // 4 registerTool calls: memory_search, memory_add, memory_build_indices, memory_build_communities
    expect(api.registerTool).toHaveBeenCalledTimes(4);
    expect(api.on).toHaveBeenCalledTimes(3);
    expect(api.registerService).toHaveBeenCalledOnce();
    // 1 registerCli call: gralkor CLI
    expect(api.registerCli).toHaveBeenCalledTimes(1);
  });

  it("registers native memory tools via factory with wrapping", async () => {
    const { register } = await import("./index.js");

    register(api);

    // First registerTool call is the factory for native memory tools
    const [factory, opts] = api.registerTool.mock.calls[0];
    expect(typeof factory).toBe("function");
    expect(opts).toEqual({ names: ["memory_search", "memory_get"] });
  });

  it("registers memory_add as a plain tool object", async () => {
    const { register } = await import("./index.js");

    register(api);

    // Second registerTool call is memory_add
    const tool = api.registerTool.mock.calls[1][0] as { name: string };
    expect(tool.name).toBe("memory_add");
  });

  it("registers the two lifecycle events via api.on()", async () => {
    const { register } = await import("./index.js");

    register(api);

    const eventNames = api.on.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(eventNames).toEqual(["before_prompt_build", "agent_end", "session_end"]);

    // Handlers should be functions
    for (const call of api.on.mock.calls) {
      expect(typeof (call as unknown[])[1]).toBe("function");
    }
  });

  it("registers health service with id, start, stop", async () => {
    const { register } = await import("./index.js");

    register(api);

    const service = api.registerService.mock.calls[0][0] as {
      id: string;
      start: () => void;
      stop: () => void;
    };
    expect(service.id).toBe("gralkor-server");
    expect(typeof service.start).toBe("function");
    expect(typeof service.stop).toBe("function");
  });

  it("registers gralkor CLI as a Commander registrar function", async () => {
    const { register } = await import("./index.js");

    register(api);

    const [registrar, opts] = api.registerCli.mock.calls[0];
    expect(typeof registrar).toBe("function");
    expect(opts).toEqual({ commands: ["gralkor"] });

    // Simulate OpenClaw calling the registrar with a mock Commander program
    const subcommands: Array<{ name: string; description: string }> = [];
    const mockSubcommand = {
      description(desc: string) {
        subcommands[subcommands.length - 1].description = desc;
        return this;
      },
      action() { return this; },
    };
    const mockGralkorCmd = {
      command(name: string) {
        subcommands.push({ name, description: "" });
        return mockSubcommand;
      },
    };
    const mockProgram = {
      command(name: string) {
        expect(name).toBe("gralkor");
        return {
          description() { return mockGralkorCmd; },
        };
      },
    };

    registrar({ program: mockProgram });

    const cmdNames = subcommands.map((c) => c.name);
    expect(cmdNames).toEqual(["status", "search <group_id> <query...>"]);
  });

  it("subsequent register() calls reuse the existing manager (no duplicate starts)", async () => {
    const { register, _resetForTesting } = await import("./index.js");
    _resetForTesting();

    const freshApi = () => ({
      pluginConfig: { dataDir: "/tmp/gralkor-test-data" },
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    });

    const api1 = freshApi();
    const api2 = freshApi();

    register(api1);
    register(api2);

    // First call registers the service, second does not
    expect(api1.registerService).toHaveBeenCalledOnce();
    expect(api2.registerService).not.toHaveBeenCalled();
  });

  it("reads plugin config from api.pluginConfig (OpenClaw contract)", async () => {
    const { register } = await import("./index.js");

    // Simulate OpenClaw passing config via api.pluginConfig, not as 2nd arg
    const apiWithConfig = {
      ...api,
      pluginConfig: { autoRecall: { enabled: false }, dataDir: "/tmp/gralkor-test-data" },
    };

    // Should not throw — config is read and applied
    register(apiWithConfig);

    // Verify hooks were registered (config was processed successfully)
    expect(api.on).toHaveBeenCalledTimes(3);
  });

  it("factory returns memory_search and memory_get tools", async () => {
    const { register } = await import("./index.js");

    register(api);

    // Get the factory and simulate OpenClaw calling it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = api.registerTool.mock.calls[0][0] as (ctx: any) => any;
    const tools = factory({ config: {}, sessionKey: "test-session" });

    expect(tools).toHaveLength(2);
    const [searchTool, getTool] = tools;

    expect(searchTool.name).toBe("memory_search");
    expect(getTool.name).toBe("memory_get");
  });

  describe("auto-recall-further-querying", () => {
    it("when memory_search tool execute returns results, response contains facts and interpretation but no further querying instruction", async () => {
      // Stub fetch so the GraphitiClient created inside register() gets graph results
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ facts: [{ uuid: "1", name: "test", fact: "Team uses React", group_id: "default", valid_at: null, invalid_at: null, expired_at: null, created_at: "2025-01-01T00:00:00Z" }] }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      // Resolve the module-level ReadyGate so execute doesn't throw
      const { createReadyGate } = await import("./config.js");
      createReadyGate().resolve();

      const { register } = await import("./index.js");
      register(api);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = api.registerTool.mock.calls[0][0] as (ctx: any) => any;
      const tools = factory({ config: {}, sessionKey: "test-session" });
      const [searchTool] = tools;

      const result = await searchTool.execute("tool-1", { query: "React" });

      // Tool result should contain the fact and interpretation instruction
      expect(result).toContain("Team uses React");
      expect(result).toContain("interpret these facts for relevance");
      // But NOT the further querying instruction (that's auto-recall only)
      expect(result).not.toContain("search memory up to 3 times");
      expect(result).not.toContain("diverse queries");

      vi.unstubAllGlobals();
    });
  });

  describe("test-mode-query-logging", () => {
    it("logs memory_search query in test mode", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ facts: [{ uuid: "1", name: "test", fact: "Team uses React", group_id: "default", valid_at: null, invalid_at: null, expired_at: null, created_at: "2025-01-01T00:00:00Z" }] }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const { createReadyGate } = await import("./config.js");
      createReadyGate().resolve();

      const testApi = {
        ...api,
        pluginConfig: { test: true, dataDir: "/tmp/gralkor-test-data" },
      };
      const { register } = await import("./index.js");
      register(testApi);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = testApi.registerTool.mock.calls[0][0] as (ctx: any) => any;
      const tools = factory({ config: {}, sessionKey: "test-session" });
      const [searchTool] = tools;

      await searchTool.execute("tool-1", { query: "React patterns" });

      const testLogs = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("[test] memory_search query:"),
      );
      expect(testLogs).toHaveLength(1);
      expect(testLogs[0][0]).toContain("React patterns");

      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe("SIGTERM handler", () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>;
    let sigTermHandler: (() => void) | undefined;

    beforeEach(() => {
      processOnSpy = vi.spyOn(process, "on").mockImplementation((event, handler) => {
        if (event === "SIGTERM") {
          sigTermHandler = handler as () => void;
        }
        return process;
      });
    });

    afterEach(() => {
      processOnSpy.mockRestore();
      sigTermHandler = undefined;
    });

    it("when SIGTERM is received with pending buffers, then flushAll is called and pending count is logged", async () => {
      const { register, _resetForTesting } = await import("./index.js");
      _resetForTesting();

      register(api);

      expect(sigTermHandler).toBeDefined();

      // Buffer a message via agent_end to create a pending entry
      const agentEndHandler = api.on.mock.calls.find(
        (call: unknown[]) => call[0] === "agent_end",
      )?.[1] as (event: unknown, ctx: unknown) => Promise<void>;

      await agentEndHandler(
        {
          messages: [{
            role: "user",
            content: [{ type: "text", text: "hello" }],
          }],
        },
        { agentId: "test-agent" },
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      sigTermHandler!();

      // Wait for async flush
      await new Promise((r) => setTimeout(r, 50));

      const sigTermLogs = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("SIGTERM received"),
      );
      expect(sigTermLogs).toHaveLength(1);
      expect(sigTermLogs[0][0]).toContain("flushing 1 pending session buffer");

      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("when SIGTERM is received with no pending buffers, then flushAll is not called", async () => {
      const { register, _resetForTesting } = await import("./index.js");
      _resetForTesting();

      register(api);

      expect(sigTermHandler).toBeDefined();

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // No messages buffered — just fire SIGTERM
      sigTermHandler!();

      await new Promise((r) => setTimeout(r, 50));

      const sigTermLogs = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("SIGTERM"),
      );
      expect(sigTermLogs).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it("when register() is called multiple times, then only one SIGTERM handler is installed", async () => {
      const { register, _resetForTesting } = await import("./index.js");
      _resetForTesting();

      const freshApi = () => ({
        pluginConfig: { dataDir: "/tmp/gralkor-test-data" },
        registerTool: vi.fn(),
        on: vi.fn(),
        registerService: vi.fn(),
        registerCli: vi.fn(),
      });

      register(freshApi());
      const firstHandler = sigTermHandler;

      // Second register — sigTermHandler should NOT be replaced
      sigTermHandler = undefined;
      register(freshApi());

      // Handler should not have been re-assigned (guard prevented second install)
      expect(sigTermHandler).toBeUndefined();
      // First handler still exists
      expect(firstHandler).toBeDefined();

      // process.on("SIGTERM") should have been called exactly once
      const sigTermCalls = processOnSpy.mock.calls.filter(
        (call) => call[0] === "SIGTERM",
      );
      expect(sigTermCalls).toHaveLength(1);
    });
  });

  describe("when ontology config is invalid", () => {
    it("then throws validation error", async () => {
      const { register } = await import("./index.js");

      const apiWithBadOntology = {
        ...api,
        pluginConfig: {
          ontology: {
            entities: {
              Entity: { description: "Reserved name" },
            },
          },
        },
      };

      expect(() => register(apiWithBadOntology)).toThrow("Entity");
    });
  });

  describe("unified-search (memory_search tool)", () => {
    // Helper: register plugin, get factory, create tools, return searchTool.execute
    async function setupSearchTool(opts: {
      nativeResult?: string | null;
      graphFacts?: Array<{ uuid: string; name: string; fact: string; group_id: string; valid_at: string | null; invalid_at: string | null; expired_at: string | null; created_at: string }>;
    }) {
      const { searchNativeMemory } = await import("./native-memory.js");
      const { setSDKLoader } = await import("./native-memory.js");

      // Mock native search via SDK loader
      const mockManager = {
        search: vi.fn().mockResolvedValue(
          opts.nativeResult ? JSON.parse(opts.nativeResult).results ?? [] : [],
        ),
        readFile: vi.fn(),
      };
      setSDKLoader(() => Promise.resolve({
        getMemorySearchManager: vi.fn().mockResolvedValue(
          opts.nativeResult !== null
            ? { manager: mockManager }
            : { manager: null, error: "unavailable" },
        ),
        readAgentMemoryFile: vi.fn(),
      }));

      // Mock graph search via fetch
      const facts = opts.graphFacts ?? [];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ facts }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      // Resolve ReadyGate
      const { createReadyGate } = await import("./config.js");
      createReadyGate().resolve();

      const { register } = await import("./index.js");
      register(api);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = api.registerTool.mock.calls[0][0] as (ctx: any) => any;
      const tools = factory({ config: {}, sessionKey: "test-session" });
      return tools[0]; // memory_search tool
    }

    const sampleFact = { uuid: "1", name: "test", fact: "Team uses React", group_id: "default", valid_at: null, invalid_at: null, expired_at: null, created_at: "2025-01-01T00:00:00Z" };
    const sampleNativeResult = JSON.stringify({ results: [{ path: "memory/notes.md", snippet: "Project notes" }] });

    afterEach(() => {
      vi.unstubAllGlobals();
      import("./native-memory.js").then(m => m.resetSDKLoader());
    });

    describe("when searching", () => {
      it("when both native and graph return results, then response includes native results and graph facts and interpretation instruction", async () => {
        const searchTool = await setupSearchTool({
          nativeResult: sampleNativeResult,
          graphFacts: [sampleFact],
        });

        const result = await searchTool.execute("tool-1", { query: "React" });

        expect(result).toContain("Project notes");
        expect(result).toContain("Team uses React");
        expect(result).toContain("interpret these facts for relevance");
      });

      it("when only graph returns results (native unavailable), then response includes graph facts only", async () => {
        const searchTool = await setupSearchTool({
          nativeResult: null,
          graphFacts: [sampleFact],
        });

        const result = await searchTool.execute("tool-1", { query: "React" });

        expect(result).toContain("Team uses React");
        expect(result).not.toContain("Project notes");
        expect(result).toContain("interpret these facts for relevance");
      });

      it("when only native returns results (graph empty), then response includes native results only", async () => {
        const searchTool = await setupSearchTool({
          nativeResult: sampleNativeResult,
          graphFacts: [],
        });

        const result = await searchTool.execute("tool-1", { query: "notes" });

        expect(result).toContain("Project notes");
        expect(result).not.toContain("Team uses React");
        expect(result).toContain("interpret these facts for relevance");
      });

      it("when neither returns results, then response is 'No memories found.'", async () => {
        const searchTool = await setupSearchTool({
          nativeResult: null,
          graphFacts: [],
        });

        const result = await searchTool.execute("tool-1", { query: "nothing" });

        expect(result).toBe("No memories found.");
      });
    });

    describe("when server is not ready", () => {
      it("then throws error", async () => {
        // Reset the module-level ready gate so it's not resolved
        const { resetReadyGate } = await import("./config.js");
        resetReadyGate();

        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ facts: [] }),
          text: async () => "",
        });
        vi.stubGlobal("fetch", fetchMock);

        const { register } = await import("./index.js");
        register(api);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const factory = api.registerTool.mock.calls[0][0] as (ctx: any) => any;
        const tools = factory({ config: {}, sessionKey: "test-session" });
        const searchTool = tools[0];

        await expect(
          searchTool.execute("tool-1", { query: "test" }),
        ).rejects.toThrow("server is not ready");

        // Re-resolve so other tests aren't affected
        const { createReadyGate } = await import("./config.js");
        createReadyGate().resolve();
      });
    });
  });
});
