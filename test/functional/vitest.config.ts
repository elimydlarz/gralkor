import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["tree"],
    include: ["**/*.functional.test.ts"],
  },
});
