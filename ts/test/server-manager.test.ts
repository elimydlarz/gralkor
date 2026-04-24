import { describe, it, expect } from "vitest";
import {
  buildConfigYaml,
  bundledServerDir,
  createServerManager,
  serializeOntologyYaml,
} from "../src/server-manager.js";

describe("bundledServerDir", () => {
  it("resolves to the server sibling of the compiled module", () => {
    const dir = bundledServerDir();
    expect(dir.endsWith("/server")).toBe(true);
  });
});

describe("createServerManager", () => {
  it("returns a manager that starts not running", () => {
    const manager = createServerManager({
      dataDir: "/tmp/fake-data-dir",
      port: 4000,
      version: "0.0.0-test",
    });
    expect(manager.isRunning()).toBe(false);
  });
});

describe("buildConfigYaml", () => {
  it("emits an empty string when no config pieces are supplied", () => {
    expect(buildConfigYaml({})).toBe("");
  });

  it("omits the llm section when llmConfig is unset (server fills in defaults)", () => {
    const yaml = buildConfigYaml({ embedderConfig: { provider: "gemini", model: "m" } });
    expect(yaml).not.toContain("llm:");
    expect(yaml).toContain("embedder:");
  });

  it("omits the embedder section when embedderConfig is unset", () => {
    const yaml = buildConfigYaml({ llmConfig: { provider: "gemini", model: "m" } });
    expect(yaml).toContain("llm:");
    expect(yaml).not.toContain("embedder:");
  });

  it("emits both sections when both configs are supplied", () => {
    const yaml = buildConfigYaml({
      llmConfig: { provider: "openai", model: "gpt-5" },
      embedderConfig: { provider: "gemini", model: "e" },
    });
    expect(yaml).toContain('provider: "openai"');
    expect(yaml).toContain('model: "gpt-5"');
    expect(yaml).toContain('provider: "gemini"');
    expect(yaml).toContain('model: "e"');
  });

  it("appends test: true when opts.test is set", () => {
    expect(buildConfigYaml({ test: true })).toContain("test: true");
  });

  it("appends the ontology block when ontologyConfig is supplied", () => {
    const yaml = buildConfigYaml({
      ontologyConfig: { entities: { Project: { description: "a project" } } },
    });
    expect(yaml).toContain("ontology:");
    expect(yaml).toContain("Project:");
  });
});

describe("serializeOntologyYaml", () => {
  it("emits just 'ontology:' for an empty ontology", () => {
    expect(serializeOntologyYaml({})).toBe("ontology:\n");
  });

  it("emits an entities block with description and attributes", () => {
    const yaml = serializeOntologyYaml({
      entities: {
        Project: {
          description: "a project",
          attributes: { status: ["active", "completed"] },
        },
      },
    });

    expect(yaml).toContain("entities:");
    expect(yaml).toContain("Project:");
    expect(yaml).toContain('description: "a project"');
    expect(yaml).toContain("- \"active\"");
    expect(yaml).toContain("- \"completed\"");
  });

  it("emits an edges block", () => {
    const yaml = serializeOntologyYaml({
      edges: { Uses: { description: "uses" } },
    });

    expect(yaml).toContain("edges:");
    expect(yaml).toContain("Uses:");
    expect(yaml).toContain('description: "uses"');
  });

  it("emits an edgeMap block with comma-keyed pairs", () => {
    const yaml = serializeOntologyYaml({
      edgeMap: { "Project,Technology": ["Uses"] },
    });

    expect(yaml).toContain("edgeMap:");
    expect(yaml).toContain('"Project,Technology":');
    expect(yaml).toContain('- "Uses"');
  });
});
