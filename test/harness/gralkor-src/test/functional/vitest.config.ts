import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["tree"],
    include: ["**/*.functional.test.ts"],
    testTimeout: 60_000,
  },
});
