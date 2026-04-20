import { describe, it, expect } from "vitest";
import { sanitizeGroupId } from "../src/client.js";

describe("sanitizeGroupId", () => {
  it("replaces hyphens with underscores", () => {
    expect(sanitizeGroupId("my-hyphen-id")).toBe("my_hyphen_id");
  });

  it("returns ids without hyphens unchanged", () => {
    expect(sanitizeGroupId("01JRZK")).toBe("01JRZK");
  });

  it("handles consecutive hyphens independently", () => {
    expect(sanitizeGroupId("a--b")).toBe("a__b");
  });
});
