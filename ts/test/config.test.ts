import { describe, it, expect } from "vitest";
import {
  PROTECTED_EDGE_ATTRS,
  PROTECTED_ENTITY_ATTRS,
  RESERVED_ENTITY_NAMES,
  validateOntologyConfig,
} from "../src/config.js";

describe("validateOntologyConfig", () => {
  it("accepts undefined ontology", () => {
    expect(() => validateOntologyConfig(undefined)).not.toThrow();
  });

  it("accepts a valid ontology", () => {
    expect(() =>
      validateOntologyConfig({
        entities: { Project: { description: "a project" } },
        edges: { Uses: { description: "uses" } },
        edgeMap: { "Project,Project": ["Uses"] },
      }),
    ).not.toThrow();
  });

  describe("when an entity name is a reserved graph label", () => {
    it.each(["Entity", "Episodic", "Community", "Saga"])(
      "rejects reserved name %s",
      (name) => {
        expect(() =>
          validateOntologyConfig({
            entities: { [name]: { description: "x" } },
          }),
        ).toThrow(/Reserved entity name/);
      },
    );
  });

  describe("when an entity attribute uses a protected EntityNode field name", () => {
    const protectedNames = [
      "uuid",
      "name",
      "group_id",
      "labels",
      "created_at",
      "summary",
      "attributes",
      "name_embedding",
    ];
    it.each(protectedNames)("rejects protected entity attribute %s", (attr) => {
      expect(() =>
        validateOntologyConfig({
          entities: {
            Project: { description: "x", attributes: { [attr]: "value" } },
          },
        }),
      ).toThrow(/Protected attribute/);
    });
  });

  describe("when an edge attribute uses a protected EntityEdge field name", () => {
    const protectedNames = [
      "uuid",
      "group_id",
      "source_node_uuid",
      "target_node_uuid",
      "created_at",
      "name",
      "fact",
      "fact_embedding",
      "episodes",
      "expired_at",
      "valid_at",
      "invalid_at",
      "attributes",
    ];
    it.each(protectedNames)("rejects protected edge attribute %s", (attr) => {
      expect(() =>
        validateOntologyConfig({
          edges: {
            Uses: { description: "x", attributes: { [attr]: "value" } },
          },
        }),
      ).toThrow(/Protected attribute/);
    });
  });

  describe("when edgeMap key format is invalid", () => {
    it.each(["Project", "A,B,C", ""])("rejects %s", (key) => {
      expect(() =>
        validateOntologyConfig({
          entities: { A: { description: "x" }, B: { description: "x" } },
          edges: { Uses: { description: "x" } },
          edgeMap: { [key]: ["Uses"] },
        }),
      ).toThrow(/Invalid edgeMap key/);
    });
  });

  it("rejects edgeMap references to undeclared entities", () => {
    expect(() =>
      validateOntologyConfig({
        entities: { A: { description: "x" } },
        edges: { Uses: { description: "x" } },
        edgeMap: { "A,Ghost": ["Uses"] },
      }),
    ).toThrow(/undeclared entity 'Ghost'/);
  });

  it("rejects edgeMap references to undeclared edges", () => {
    expect(() =>
      validateOntologyConfig({
        entities: { A: { description: "x" }, B: { description: "x" } },
        edges: { Uses: { description: "x" } },
        edgeMap: { "A,B": ["Ghost"] },
      }),
    ).toThrow(/undeclared edge 'Ghost'/);
  });
});
