import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveConfig,
  validateOntologyConfig,
  validateConfig,
  defaultConfig,
  GRAPHITI_URL,
  GRAPHITI_PORT,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_EMBEDDER_PROVIDER,
  DEFAULT_EMBEDDER_MODEL,
  createReadyGate,
  resetReadyGate,
} from "./config.js";
import type { OntologyConfig } from "./config.js";

const VALID_ONTOLOGY: OntologyConfig = {
  entities: {
    Project: {
      description: "A software project or initiative.",
      attributes: {
        status: ["active", "completed", "paused"],
        language: "Primary programming language",
      },
    },
    Technology: {
      description: "A technology, framework, or tool.",
      attributes: {
        category: ["language", "framework", "database"],
      },
    },
  },
  edges: {
    Uses: {
      description: "A project using a technology.",
      attributes: {
        version: "Version in use",
      },
    },
  },
  edgeMap: {
    "Project,Technology": ["Uses"],
  },
};

describe("resolveConfig()", () => {
  it("returns defaults when called with no arguments", () => {
    const config = resolveConfig();
    expect(config).toMatchObject(defaultConfig);
    expect(config.test).toBe(false);
  });

  it("returns defaults when called with empty object", () => {
    const config = resolveConfig({});
    expect(config).toMatchObject(defaultConfig);
    expect(config.test).toBe(false);
  });

  it("exports GRAPHITI_URL constant pointing to localhost", () => {
    expect(GRAPHITI_URL).toBe("http://127.0.0.1:8001");
  });

  it("exports GRAPHITI_PORT constant", () => {
    expect(GRAPHITI_PORT).toBe(8001);
  });

  it("passes through dataDir when provided", () => {
    const config = resolveConfig({ dataDir: "/custom/data" });
    expect(config.dataDir).toBe("/custom/data");
  });

  it("defaults dataDir to undefined when not provided", () => {
    const config = resolveConfig({});
    expect(config.dataDir).toBeUndefined();
  });

  it("overrides autoCapture.enabled", () => {
    const config = resolveConfig({ autoCapture: { enabled: false } });
    expect(config.autoCapture.enabled).toBe(false);
  });

  it("overrides autoRecall fields independently", () => {
    const config = resolveConfig({ autoRecall: { enabled: false, maxResults: 20 } });
    expect(config.autoRecall.enabled).toBe(false);
    expect(config.autoRecall.maxResults).toBe(20);
  });

  it("uses default maxResults when only enabled is overridden", () => {
    const config = resolveConfig({ autoRecall: { enabled: true } as any });
    expect(config.autoRecall.maxResults).toBe(10);
  });

  it("passes through llm config when provided", () => {
    const config = resolveConfig({ llm: { provider: "gemini", model: "gemini-2.0-flash" } });
    expect(config.llm).toEqual({ provider: "gemini", model: "gemini-2.0-flash" });
  });

  it("passes through embedder config when provided", () => {
    const config = resolveConfig({ embedder: { provider: "openai", model: "text-embedding-3-small" } });
    expect(config.embedder).toEqual({ provider: "openai", model: "text-embedding-3-small" });
  });

  it("defaults llm and embedder to undefined when not provided", () => {
    const config = resolveConfig({});
    expect(config.llm).toBeUndefined();
    expect(config.embedder).toBeUndefined();
  });

  it("defaults test to false", () => {
    const config = resolveConfig({});
    expect(config.test).toBe(false);
  });

  it("passes through test when true", () => {
    const config = resolveConfig({ test: true });
    expect(config.test).toBe(true);
  });

  it("passes through ontology when provided", () => {
    const config = resolveConfig({ ontology: VALID_ONTOLOGY });
    expect(config.ontology).toBe(VALID_ONTOLOGY);
  });

  it("defaults ontology to undefined when not provided", () => {
    const config = resolveConfig({});
    expect(config.ontology).toBeUndefined();
  });
});

describe("defaultConfig", () => {
  it("has autoCapture enabled by default", () => {
    expect(defaultConfig.autoCapture.enabled).toBe(true);
  });

  it("has idleTimeoutMs of 5 minutes", () => {
    expect(defaultConfig.idleTimeoutMs).toBe(300_000);
  });

  it("has autoRecall enabled by default", () => {
    expect(defaultConfig.autoRecall.enabled).toBe(true);
  });

  it("has autoRecall maxResults of 10", () => {
    expect(defaultConfig.autoRecall.maxResults).toBe(10);
  });

  it("configSchema defaults match defaultConfig (single source of truth)", async () => {
    const { configSchema } = await import("./index.js");
    const schema = configSchema.properties;
    expect(schema.autoCapture.properties.enabled.default).toBe(defaultConfig.autoCapture.enabled);
    expect(schema.autoRecall.properties.enabled.default).toBe(defaultConfig.autoRecall.enabled);
    expect(schema.autoRecall.properties.maxResults.default).toBe(defaultConfig.autoRecall.maxResults);
  });

  it("plugin manifest defaults match defaultConfig (single source of truth)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));

    for (const manifestPath of [
      join(__dirname, "..", "openclaw.plugin.json"),
      join(__dirname, "..", "resources", "memory", "openclaw.plugin.json"),
    ]) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
      const props = manifest.configSchema.properties;
      expect(props.autoCapture.properties.enabled.default, `${manifestPath}: autoCapture.enabled`).toBe(defaultConfig.autoCapture.enabled);
      expect(props.autoRecall.properties.enabled.default, `${manifestPath}: autoRecall.enabled`).toBe(defaultConfig.autoRecall.enabled);
      expect(props.autoRecall.properties.maxResults.default, `${manifestPath}: autoRecall.maxResults`).toBe(defaultConfig.autoRecall.maxResults);
    }
  });
});

describe("provider defaults", () => {
  it("DEFAULT_LLM_PROVIDER is gemini", () => {
    expect(DEFAULT_LLM_PROVIDER).toBe("gemini");
  });

  it("DEFAULT_LLM_MODEL is gemini-3-flash-preview", () => {
    expect(DEFAULT_LLM_MODEL).toBe("gemini-3-flash-preview");
  });

  it("DEFAULT_EMBEDDER_PROVIDER is gemini", () => {
    expect(DEFAULT_EMBEDDER_PROVIDER).toBe("gemini");
  });

  it("DEFAULT_EMBEDDER_MODEL is gemini-embedding-2-preview", () => {
    expect(DEFAULT_EMBEDDER_MODEL).toBe("gemini-embedding-2-preview");
  });
});

describe("ReadyGate", () => {
  it("starts not ready", () => {
    resetReadyGate();
    const gate = createReadyGate();
    expect(gate.isReady()).toBe(false);
  });

  it("becomes ready after resolve()", () => {
    resetReadyGate();
    const gate = createReadyGate();
    gate.resolve();
    expect(gate.isReady()).toBe(true);
  });

  it("resetReadyGate() resets back to not ready", () => {
    resetReadyGate();
    const gate = createReadyGate();
    gate.resolve();
    expect(gate.isReady()).toBe(true);
    resetReadyGate();
    expect(gate.isReady()).toBe(false);
  });

  it("shares state across multiple createReadyGate() calls", () => {
    resetReadyGate();
    const gate1 = createReadyGate();
    const gate2 = createReadyGate();
    gate1.resolve();
    expect(gate2.isReady()).toBe(true);
  });
});

describe("validateOntologyConfig()", () => {
  describe("when ontology is undefined", () => {
    it("then does not throw", () => {
      expect(() => validateOntologyConfig(undefined)).not.toThrow();
    });
  });

  describe("when ontology is valid", () => {
    it("then does not throw", () => {
      expect(() => validateOntologyConfig(VALID_ONTOLOGY)).not.toThrow();
    });
  });

  describe("when entity name is a reserved graph label", () => {
    it.each(["Entity", "Episodic", "Community", "Saga"])("then rejects '%s'", (name) => {
      const ontology: OntologyConfig = {
        entities: { [name]: { description: "test" } },
      };
      expect(() => validateOntologyConfig(ontology)).toThrow(name);
    });
  });

  describe("when entity attribute uses a protected EntityNode field name", () => {
    it.each(["uuid", "name", "group_id", "labels", "created_at", "summary", "attributes", "name_embedding"])(
      "then rejects '%s'",
      (attr) => {
        const ontology: OntologyConfig = {
          entities: {
            Project: {
              description: "test",
              attributes: { [attr]: "some description" },
            },
          },
        };
        expect(() => validateOntologyConfig(ontology)).toThrow(attr);
      },
    );
  });

  describe("when edge attribute uses a protected EntityEdge field name", () => {
    it.each(["uuid", "group_id", "source_node_uuid", "target_node_uuid", "created_at", "name", "fact", "fact_embedding", "episodes", "expired_at", "valid_at", "invalid_at", "attributes"])(
      "then rejects '%s'",
      (attr) => {
        const ontology: OntologyConfig = {
          edges: {
            Uses: {
              description: "test",
              attributes: { [attr]: "some description" },
            },
          },
        };
        expect(() => validateOntologyConfig(ontology)).toThrow(attr);
      },
    );
  });

  describe("when edgeMap references undeclared entity", () => {
    it("then rejects", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: { description: "test" },
        },
        edges: {
          Uses: { description: "test" },
        },
        edgeMap: {
          "Project,Unknown": ["Uses"],
        },
      };
      expect(() => validateOntologyConfig(ontology)).toThrow("Unknown");
    });
  });

  describe("when edgeMap references undeclared edge", () => {
    it("then rejects", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: { description: "test" },
          Technology: { description: "test" },
        },
        edgeMap: {
          "Project,Technology": ["Nonexistent"],
        },
      };
      expect(() => validateOntologyConfig(ontology)).toThrow("Nonexistent");
    });
  });

  describe("when edgeMap key format is invalid", () => {
    it("then rejects with descriptive message", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: { description: "test" },
        },
        edges: {
          Uses: { description: "test" },
        },
        edgeMap: {
          "Project": ["Uses"],
        },
      };
      expect(() => validateOntologyConfig(ontology)).toThrow("Invalid edgeMap key 'Project': expected 'EntityA,EntityB'");
    });
  });

  describe("when excludedEntityTypes contains a declared entity", () => {
    it("then rejects", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: { description: "test" },
        },
        excludedEntityTypes: ["Project"],
      };
      expect(() => validateOntologyConfig(ontology)).toThrow("Project");
    });
  });

  describe("when excludedEntityTypes contains only non-declared entities", () => {
    it("then does not throw", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: { description: "test" },
        },
        excludedEntityTypes: ["Person", "Organization"],
      };
      expect(() => validateOntologyConfig(ontology)).not.toThrow();
    });
  });
});

describe("validateConfig()", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("when LLM provider is known and env var is present", () => {
    it("then LLM check passes", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      const config = resolveConfig({ llm: { provider: "gemini", model: "test" } });
      const result = await validateConfig(config);
      const llmCheck = result.checks.find(c => c.label.includes("LLM"));
      expect(llmCheck?.status).toBe("pass");
    });
  });

  describe("when LLM provider is known but env var is missing", () => {
    it("then LLM check fails with expected env var name", async () => {
      delete process.env.GOOGLE_API_KEY;
      const config = resolveConfig({ llm: { provider: "gemini", model: "test" } });
      const result = await validateConfig(config);
      const llmCheck = result.checks.find(c => c.label.includes("LLM"));
      expect(llmCheck?.status).toBe("fail");
      expect(llmCheck?.message).toContain("GOOGLE_API_KEY");
    });
  });

  describe("when embedder provider is known and env var is present", () => {
    it("then embedder check passes", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      const config = resolveConfig({ embedder: { provider: "gemini", model: "test" } });
      const result = await validateConfig(config);
      const embedderCheck = result.checks.find(c => c.label.includes("Embedder"));
      expect(embedderCheck?.status).toBe("pass");
    });
  });

  describe("when embedder provider is known but env var is missing", () => {
    it("then embedder check fails with expected env var name", async () => {
      delete process.env.OPENAI_API_KEY;
      const config = resolveConfig({ embedder: { provider: "openai", model: "test" } });
      const result = await validateConfig(config);
      const embedderCheck = result.checks.find(c => c.label.includes("Embedder"));
      expect(embedderCheck?.status).toBe("fail");
      expect(embedderCheck?.message).toContain("OPENAI_API_KEY");
    });
  });

  describe("when provider is unknown", () => {
    it("then check warns with provider name", async () => {
      const config = resolveConfig({ llm: { provider: "unknown-provider", model: "test" } });
      const result = await validateConfig(config);
      const llmCheck = result.checks.find(c => c.label.includes("LLM"));
      expect(llmCheck?.status).toBe("warn");
      expect(llmCheck?.message).toContain("unknown-provider");
    });
  });

  describe("when uv is on PATH", () => {
    it("then uv check passes", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      const config = resolveConfig({});
      const result = await validateConfig(config);
      const uvCheck = result.checks.find(c => c.label === "uv");
      expect(uvCheck?.status).toBe("pass");
    });
  });

  describe("when uv is not on PATH", () => {
    it("then uv check fails", async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = "/nonexistent";
      process.env.GOOGLE_API_KEY = "test-key";
      try {
        const config = resolveConfig({});
        const result = await validateConfig(config);
        const uvCheck = result.checks.find(c => c.label === "uv");
        expect(uvCheck?.status).toBe("fail");
        expect(uvCheck?.message).toContain("not found on PATH");
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });

  describe("when all checks pass", () => {
    it("then result.ok is true", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      const config = resolveConfig({
        llm: { provider: "gemini", model: "test" },
        embedder: { provider: "gemini", model: "test" },
      });
      const result = await validateConfig(config);
      expect(result.ok).toBe(true);
    });
  });

  describe("when any check fails", () => {
    it("then result.ok is false", async () => {
      delete process.env.GOOGLE_API_KEY;
      const config = resolveConfig({ llm: { provider: "gemini", model: "test" } });
      const result = await validateConfig(config);
      expect(result.ok).toBe(false);
    });
  });
});

