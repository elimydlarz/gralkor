import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveSecretEnv,
  setSecretInputSDKLoader,
  resetSecretInputSDKLoader,
  type SecretInputSDK,
} from "./resolve-secrets.js";

function createMockSDK(): SecretInputSDK {
  return {
    normalizeResolvedSecretInputString({ value, path: _path }) {
      if (value == null) return undefined;
      // Simulate SecretRef resolution: { $ref: "env:X" } → "resolved-X"
      if (typeof value === "object" && value !== null && "$ref" in value) {
        return `resolved-${(value as { $ref: string }).$ref}`;
      }
      return value;
    },
    normalizeSecretInput(input: unknown) {
      if (input == null) return undefined;
      const str = String(input).trim();
      return str.length > 0 ? str : undefined;
    },
  };
}

describe("secret-resolution", () => {
  beforeEach(() => {
    setSecretInputSDKLoader(() => Promise.resolve(createMockSDK()));
  });

  afterEach(() => {
    resetSecretInputSDKLoader();
  });

  describe("when config contains a plaintext API key string", () => {
    it("then resolved value is that string", async () => {
      const env = await resolveSecretEnv({ googleApiKey: "sk-abc123" });
      expect(env.GOOGLE_API_KEY).toBe("sk-abc123");
    });
  });

  describe("when config contains a SecretRef object", () => {
    it("then resolved value is the dereferenced secret", async () => {
      const env = await resolveSecretEnv({
        openaiApiKey: { $ref: "env:OPENAI_API_KEY" },
      });
      expect(env.OPENAI_API_KEY).toBe("resolved-env:OPENAI_API_KEY");
    });
  });

  describe("when config value is null or absent", () => {
    it("then resolved value is undefined", async () => {
      const env = await resolveSecretEnv({
        googleApiKey: null,
        openaiApiKey: undefined,
      });
      expect(env.GOOGLE_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
    });
  });

  describe("when resolved value is empty or whitespace", () => {
    it("then resolved value is undefined", async () => {
      const env = await resolveSecretEnv({
        googleApiKey: "   ",
        anthropicApiKey: "",
      });
      expect(env.GOOGLE_API_KEY).toBeUndefined();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    });
  });

  it("then resolved API keys are passed to the server manager as env vars", async () => {
    const env = await resolveSecretEnv({
      googleApiKey: "gk-123",
      openaiApiKey: "sk-456",
      anthropicApiKey: "ak-789",
      groqApiKey: "gsk-012",
    });
    expect(env).toEqual({
      GOOGLE_API_KEY: "gk-123",
      OPENAI_API_KEY: "sk-456",
      ANTHROPIC_API_KEY: "ak-789",
      GROQ_API_KEY: "gsk-012",
    });
  });
});
