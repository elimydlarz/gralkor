import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["tree"],
    exclude: ["test/functional/**", "test/harness/**", "node_modules/**"],
  },
});
