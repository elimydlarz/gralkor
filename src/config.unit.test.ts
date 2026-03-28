import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateOntologyConfig, resolveConfig, validateConfig } from "./config.js";
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
      // Override PATH to exclude uv
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

describe("resolveConfig()", () => {
  describe("when ontology is provided", () => {
    it("then passes it through unchanged", () => {
      const config = resolveConfig({ ontology: VALID_ONTOLOGY });
      expect(config.ontology).toBe(VALID_ONTOLOGY);
    });
  });

  describe("when ontology is not provided", () => {
    it("then defaults to undefined", () => {
      const config = resolveConfig({});
      expect(config.ontology).toBeUndefined();
    });
  });
});
