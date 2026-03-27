import { describe, it, expect } from "vitest";
import { validateOntologyConfig, resolveConfig } from "./config.js";
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
