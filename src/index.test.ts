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
    expect(mod.id).toBe("memory-gralkor");
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
    expect(entry.id).toBe("memory-gralkor");
    expect(entry.name).toBe("Gralkor Memory");
    expect(typeof entry.description).toBe("string");
    expect(entry.kind).toBe("memory");
    expect(entry.configSchema).toBeDefined();
  });
});

describe("register()", () => {
  let api: {
    registerTool: ReturnType<typeof vi.fn>;
    registerHook: ReturnType<typeof vi.fn>;
    registerService: ReturnType<typeof vi.fn>;
    registerCli: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      registerTool: vi.fn(),
      registerHook: vi.fn(),
      registerService: vi.fn(),
      registerCli: vi.fn(),
    };
  });

  it("registers only CLI when no graphitiUrl configured and no env var", async () => {
    delete process.env.GRAPHITI_URL;
    const { register } = await import("./index.js");

    register(api);

    expect(api.registerCli).toHaveBeenCalledOnce();
    expect(api.registerTool).not.toHaveBeenCalled();
    expect(api.registerHook).not.toHaveBeenCalled();
    expect(api.registerService).not.toHaveBeenCalled();
  });

  it("registers full plugin when graphitiUrl is configured", async () => {
    const { register } = await import("./index.js");

    register(api, { graphitiUrl: "http://localhost:8001" });

    expect(api.registerTool).toHaveBeenCalledTimes(3);
    expect(api.registerHook).toHaveBeenCalledTimes(2);
    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerCli).toHaveBeenCalledOnce();
  });

  it("registers full plugin when GRAPHITI_URL env var is set", async () => {
    process.env.GRAPHITI_URL = "http://localhost:8001";
    const { register } = await import("./index.js");

    try {
      register(api);

      expect(api.registerTool).toHaveBeenCalledTimes(3);
      expect(api.registerHook).toHaveBeenCalledTimes(2);
      expect(api.registerService).toHaveBeenCalledOnce();
      expect(api.registerCli).toHaveBeenCalledOnce();
    } finally {
      delete process.env.GRAPHITI_URL;
    }
  });

  it("registers the three memory_* tools", async () => {
    const { register } = await import("./index.js");

    register(api, { graphitiUrl: "http://localhost:8001" });

    const toolNames = api.registerTool.mock.calls.map(
      (call: unknown[]) => (call[0] as { name: string }).name,
    );
    expect(toolNames).toEqual(["memory_recall", "memory_store", "memory_forget"]);
  });

  it("registers the two hooks", async () => {
    const { register } = await import("./index.js");

    register(api, { graphitiUrl: "http://localhost:8001" });

    const hookNames = api.registerHook.mock.calls.map(
      (call: unknown[]) => (call[0] as { name: string }).name,
    );
    expect(hookNames).toEqual(["before_agent_start", "agent_end"]);
  });

  it("registers gralkor CLI as a Commander registrar function", async () => {
    const { register } = await import("./index.js");

    register(api, { graphitiUrl: "http://localhost:8001" });

    // First arg is a registrar function, second is opts with command names
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
});
