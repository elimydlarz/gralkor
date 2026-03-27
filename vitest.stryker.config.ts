import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["test/functional/**", "node_modules/**"],
  },
});
