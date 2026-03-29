import { describe, it, expect, vi, beforeEach } from "vitest";
import { status } from "./status.js";
import * as oc from "../lib/openclaw.js";

vi.mock("../lib/openclaw.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const mocked = vi.mocked(oc);

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
  mocked.getPluginInfo.mockResolvedValue({
    id: "gralkor",
    version: "19.0.4",
    enabled: true,
  });
  mocked.getConfig.mockResolvedValue("gralkor");
});

describe("status", () => {
  it("shows graph stats from health response graph field (not graph_stats)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        graph: { connected: true, node_count: 42, edge_count: 100 },
        data_dir: "/data/.gralkor-data",
      }),
    });

    await status();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("42 nodes");
    expect(output).toContain("100 edges");
    expect(output).toContain("/data/.gralkor-data");
  });

  it("shows disconnected when graph.connected is false", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        graph: { connected: false, error: "connection refused" },
      }),
    });

    await status();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("disconnected");
    expect(output).toContain("connection refused");
  });

  it("shows not running when fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await status();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("not running");
  });

  it("shows not installed when plugin not found", async () => {
    mocked.getPluginInfo.mockResolvedValue(null);

    await status();

    expect(process.exitCode).toBe(1);
  });
});
