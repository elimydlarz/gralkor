import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

  describe("start — adopt path (pre-flight finds a healthy server)", () => {
    let workDir: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), "gralkor-mgr-"));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
      rmSync(workDir, { recursive: true, force: true });
    });

    it("adopts a running server without spawning a child process", async () => {
      const fetchStub = vi.fn(async () => new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchStub);

      const manager = createServerManager({
        dataDir: workDir,
        port: 4000,
        version: "0.0.0-test",
      });

      await manager.start();

      // Adopted — no child process was spawned, so isRunning() stays false.
      expect(manager.isRunning()).toBe(false);
      expect(fetchStub).toHaveBeenCalledWith(
        "http://127.0.0.1:4000/health",
        expect.any(Object),
      );

      await manager.stop();
    });
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
