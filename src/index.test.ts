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

  it("registers gralkor CLI with status, search, and clear commands", async () => {
    const { register } = await import("./index.js");

    register(api, { graphitiUrl: "http://localhost:8001" });

    const cli = api.registerCli.mock.calls[0][0] as {
      name: string;
      commands: Array<{ name: string }>;
    };
    expect(cli.name).toBe("gralkor");
    const cmdNames = cli.commands.map((c) => c.name);
    expect(cmdNames).toEqual(["status", "search", "clear"]);
  });
});
