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

  it("exports tools list", async () => {
    const mod = await import("./index.js");
    expect(mod.tools).toEqual(["graph_search", "graph_add"]);
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

    expect(api.registerTool).toHaveBeenCalledTimes(2);
    expect(api.on).toHaveBeenCalledTimes(2);
    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerCli).toHaveBeenCalledOnce();
  });

  it("registers two graph tools", async () => {
    const { register } = await import("./index.js");

    register(api);

    const toolNames = api.registerTool.mock.calls.map(
      (call: unknown[]) => (call[0] as { name: string }).name,
    );
    expect(toolNames).toEqual(["graph_search", "graph_add"]);
  });

  it("registers the two lifecycle events via api.on()", async () => {
    const { register } = await import("./index.js");

    register(api);

    const eventNames = api.on.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(eventNames).toEqual(["before_agent_start", "agent_end"]);

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
    expect(service.id).toBe("gralkor-health");
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
    expect(cmdNames).toEqual(["status", "search <query...>", "clear [group_id]"]);
  });
});
