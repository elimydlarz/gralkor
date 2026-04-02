import { describe, it, expect } from "vitest";
import { parsePluginList, isConfigWarningOnly } from "./openclaw.js";

describe("parsePluginList", () => {
  it("parses table output with multiple plugins", () => {
    const output = [
      "Name          Version   Enabled   Kind",
      "────────────  ────────  ────────  ────────",
      "gralkor       19.0.4    true      memory",
      "some-plugin   2.1.0     false     tool",
    ].join("\n");

    const plugins = parsePluginList(output);
    expect(plugins).toEqual([
      { id: "gralkor", version: "19.0.4", enabled: true },
      { id: "some-plugin", version: "2.1.0", enabled: false },
    ]);
  });

  it("handles checkmark for enabled", () => {
    const output = "gralkor  19.0.4  ✓  memory\n";
    const plugins = parsePluginList(output);
    expect(plugins).toEqual([
      { id: "gralkor", version: "19.0.4", enabled: true },
    ]);
  });

  it("handles dash for missing version", () => {
    const output = "gralkor  -  true  memory\n";
    const plugins = parsePluginList(output);
    expect(plugins).toEqual([
      { id: "gralkor", version: null, enabled: true },
    ]);
  });

  it("returns empty array for empty output", () => {
    expect(parsePluginList("")).toEqual([]);
  });

  it("skips header and separator lines", () => {
    const output = [
      "Name  Version  Enabled  Kind",
      "───────────────────────────",
      "",
    ].join("\n");
    expect(parsePluginList(output)).toEqual([]);
  });
});
