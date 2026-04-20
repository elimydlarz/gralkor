import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["tree"],
    include: ["test/**/*.test.ts"],
  },
});
