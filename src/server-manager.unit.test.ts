import { describe, it, expect } from "vitest";
import { serializeOntologyYaml } from "./server-manager.js";
import type { OntologyConfig } from "./config.js";

describe("serializeOntologyYaml()", () => {
  describe("when ontology has string attributes", () => {
    it("then serializes as inline YAML scalars", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: {
            description: "A software project.",
            attributes: {
              language: "Primary programming language",
            },
          },
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain("ontology:");
      expect(yaml).toContain("  entities:");
      expect(yaml).toContain("    Project:");
      expect(yaml).toContain('      description: "A software project."');
      expect(yaml).toContain("      attributes:");
      expect(yaml).toContain('        language: "Primary programming language"');
    });
  });

  describe("when ontology has array (enum) attributes", () => {
    it("then serializes as YAML sequences", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: {
            description: "A project.",
            attributes: {
              status: ["active", "completed", "paused"],
            },
          },
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain("        status:");
      expect(yaml).toContain('          - "active"');
      expect(yaml).toContain('          - "completed"');
      expect(yaml).toContain('          - "paused"');
    });
  });

  describe("when ontology has object attributes with type", () => {
    it("then serializes as nested YAML mapping", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: {
            description: "A project.",
            attributes: {
              budget: { type: "float", description: "Budget in USD" },
            },
          },
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain("        budget:");
      expect(yaml).toContain('          type: "float"');
      expect(yaml).toContain('          description: "Budget in USD"');
    });
  });

  describe("when ontology has object attributes with enum", () => {
    it("then serializes enum as nested sequence", () => {
      const ontology: OntologyConfig = {
        entities: {
          Project: {
            description: "A project.",
            attributes: {
              priority: { enum: ["low", "medium", "high"], description: "Priority level" },
            },
          },
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain("        priority:");
      expect(yaml).toContain("          enum:");
      expect(yaml).toContain('            - "low"');
      expect(yaml).toContain('            - "medium"');
      expect(yaml).toContain('            - "high"');
      expect(yaml).toContain('          description: "Priority level"');
    });
  });

  describe("when ontology has edges and edgeMap", () => {
    it("then serializes both sections", () => {
      const ontology: OntologyConfig = {
        entities: {
          Person: { description: "A person." },
          Project: { description: "A project." },
        },
        edges: {
          WorksOn: {
            description: "Person works on project.",
            attributes: {
              role: "Their role",
            },
          },
        },
        edgeMap: {
          "Person,Project": ["WorksOn"],
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain("  edges:");
      expect(yaml).toContain("    WorksOn:");
      expect(yaml).toContain('      description: "Person works on project."');
      expect(yaml).toContain("  edgeMap:");
      expect(yaml).toContain('    "Person,Project":');
      expect(yaml).toContain('      - "WorksOn"');
    });
  });

  describe("when description contains YAML-special characters", () => {
    it("then quotes the value", () => {
      const ontology: OntologyConfig = {
        entities: {
          Note: {
            description: "A note: important #1",
            attributes: {
              tag: "Tag with: colon",
            },
          },
        },
      };
      const yaml = serializeOntologyYaml(ontology);
      expect(yaml).toContain('"A note: important #1"');
      expect(yaml).toContain('"Tag with: colon"');
    });
  });
});
