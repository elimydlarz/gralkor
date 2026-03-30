import { describe, it, expect, vi, beforeEach } from "vitest";

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
    expect(mod.tools).toEqual(["memory_search", "memory_get", "memory_add"]);
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
    registerTool: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    registerService: ReturnType<typeof vi.fn>;
    registerCli: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      registerTool: vi.fn(),
      on: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    };
  });

  it("registers full plugin", async () => {
    const { register } = await import("./index.js");

    register(api);

    // 2 registerTool calls: 1 factory (memory_search + memory_get) + 1 plain (memory_add)
    expect(api.registerTool).toHaveBeenCalledTimes(2);
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
    expect(cmdNames).toEqual(["status", "check", "search <group_id> <query...>", "clear <group_id>"]);
  });

  it("reads plugin config from api.pluginConfig (OpenClaw contract)", async () => {
    const { register } = await import("./index.js");

    // Simulate OpenClaw passing config via api.pluginConfig, not as 2nd arg
    const apiWithConfig = {
      ...api,
      pluginConfig: { autoRecall: { enabled: false } },
    };

    // Should not throw — config is read and applied
    register(apiWithConfig);

    // Verify hooks were registered (config was processed successfully)
    expect(api.on).toHaveBeenCalledTimes(3);
  });

  it("factory returns wrapped memory_search that combines native + graph results", async () => {
    const { register } = await import("./index.js");

    register(api);

    // Get the factory and simulate OpenClaw calling it
    const factory = api.registerTool.mock.calls[0][0] as (ctx: any) => any;
    const tools = factory({ config: {}, sessionKey: "test-session" });

    expect(tools).toHaveLength(2);
    const [searchTool, getTool] = tools;

    // The wrapped search tool should still be named memory_search
    expect(searchTool.name).toBe("memory_search");
    // memory_get should be unwrapped
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
});
