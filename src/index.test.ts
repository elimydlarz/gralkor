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
    runtime: {
      tools: {
        createMemorySearchTool: ReturnType<typeof vi.fn>;
        createMemoryGetTool: ReturnType<typeof vi.fn>;
        registerMemoryCli: ReturnType<typeof vi.fn>;
      };
    };
    registerTool: ReturnType<typeof vi.fn>;
    registerHook: ReturnType<typeof vi.fn>;
    registerService: ReturnType<typeof vi.fn>;
    registerCli: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      runtime: {
        tools: {
          createMemorySearchTool: vi.fn().mockReturnValue({ name: "memory_search" }),
          createMemoryGetTool: vi.fn().mockReturnValue({ name: "memory_get" }),
          registerMemoryCli: vi.fn(),
        },
      },
      registerTool: vi.fn(),
      registerHook: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    };
  });

  it("registers full plugin", async () => {
    const { register } = await import("./index.js");

    register(api);

    expect(api.registerTool).toHaveBeenCalledTimes(3);
    expect(api.registerHook).toHaveBeenCalledTimes(2);
    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerCli).toHaveBeenCalledTimes(2);
  });

  it("registers two graph tools and one factory for native memory tools", async () => {
    const { register } = await import("./index.js");

    register(api);

    // First 2 calls are direct tool objects
    const directToolNames = api.registerTool.mock.calls.slice(0, 2).map(
      (call: unknown[]) => (call[0] as { name: string }).name,
    );
    expect(directToolNames).toEqual(["graph_memory_recall", "graph_memory_store"]);

    // 3rd call is a factory function with opts
    const [factory, opts] = api.registerTool.mock.calls[2];
    expect(typeof factory).toBe("function");
    expect(opts).toEqual({ names: ["memory_search", "memory_get"] });
  });

  it("registers the two hooks", async () => {
    const { register } = await import("./index.js");

    register(api);

    const hookNames = api.registerHook.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(hookNames).toEqual(["before_agent_start", "agent_end"]);
  });

  it("registers gralkor CLI as a Commander registrar function", async () => {
    const { register } = await import("./index.js");

    register(api);

    // First CLI call is the gralkor registrar
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
    expect(cmdNames).toEqual(["status", "search <query...>", "clear [group_id]"]);
  });

  it("registers memory CLI that delegates to runtime helper", async () => {
    const { register } = await import("./index.js");

    register(api);

    // Second CLI call is the memory registrar
    const [registrar, opts] = api.registerCli.mock.calls[1];
    expect(typeof registrar).toBe("function");
    expect(opts).toEqual({ commands: ["memory"] });

    // Simulate OpenClaw calling the registrar
    const mockProgram = { name: "mock-program" };
    registrar({ program: mockProgram });

    expect(api.runtime.tools.registerMemoryCli).toHaveBeenCalledWith(mockProgram);
  });

  it("factory invokes runtime helpers with correct args and returns both tools", async () => {
    const { register } = await import("./index.js");

    register(api);

    const [factory] = api.registerTool.mock.calls[2];
    const ctx = { config: { some: "config" }, sessionKey: "sess-123", agentId: "agent-1" };

    const result = factory(ctx);

    expect(api.runtime.tools.createMemorySearchTool).toHaveBeenCalledWith({
      config: ctx.config,
      agentSessionKey: ctx.sessionKey,
    });
    expect(api.runtime.tools.createMemoryGetTool).toHaveBeenCalledWith({
      config: ctx.config,
      agentSessionKey: ctx.sessionKey,
    });
    expect(result).toEqual([{ name: "memory_search" }, { name: "memory_get" }]);
  });

  it("factory returns null when runtime helpers return null", async () => {
    api.runtime.tools.createMemorySearchTool.mockReturnValue(null);
    api.runtime.tools.createMemoryGetTool.mockReturnValue(null);
    const { register } = await import("./index.js");

    register(api);

    const [factory] = api.registerTool.mock.calls[2];
    const result = factory({ config: {}, sessionKey: "s" });

    expect(result).toBeNull();
  });
});
