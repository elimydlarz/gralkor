import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLLMClient } from "./llm-client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("createLLMClient", () => {
  describe("returns null when key is absent", () => {
    it("gemini provider without googleApiKey", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "gemini" } };
      expect(createLLMClient(config)).toBeNull();
    });

    it("openai provider without openaiApiKey", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "openai" } };
      expect(createLLMClient(config)).toBeNull();
    });

    it("anthropic provider without anthropicApiKey", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "anthropic" } };
      expect(createLLMClient(config)).toBeNull();
    });

    it("groq provider without groqApiKey", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "groq" } };
      expect(createLLMClient(config)).toBeNull();
    });

    it("returns null for whitespace-only key", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "anthropic" }, anthropicApiKey: "   " };
      expect(createLLMClient(config)).toBeNull();
    });
  });

  describe("returns LLMClient when key is present", () => {
    it("gemini", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "gemini" }, googleApiKey: "key-g" };
      expect(createLLMClient(config)).not.toBeNull();
    });

    it("openai", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "openai" }, openaiApiKey: "key-o" };
      expect(createLLMClient(config)).not.toBeNull();
    });

    it("anthropic", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "anthropic" }, anthropicApiKey: "key-a" };
      expect(createLLMClient(config)).not.toBeNull();
    });

    it("groq", () => {
      const config: GralkorConfig = { ...defaultConfig, llm: { provider: "groq" }, groqApiKey: "key-gr" };
      expect(createLLMClient(config)).not.toBeNull();
    });
  });
});

describe("anthropic client", () => {
  const config: GralkorConfig = {
    ...defaultConfig,
    llm: { provider: "anthropic", model: "claude-test" },
    anthropicApiKey: "test-key",
  };

  it("sends correct headers and body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      content: [{ type: "text", text: "Hello" }],
    }));

    const client = createLLMClient(config)!;
    const result = await client.generate([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
    ], 200);

    expect(result).toBe("Hello");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["x-api-key"]).toBe("test-key");
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("claude-test");
    expect(body.max_tokens).toBe(200);
    expect(body.system).toBe("You are helpful");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited", headers: { get: () => null } } as unknown as Response);
    const client = createLLMClient(config)!;
    await expect(client.generate([{ role: "user", content: "Hi" }])).rejects.toThrow("429");
  });
});

describe("openai client", () => {
  const config: GralkorConfig = {
    ...defaultConfig,
    llm: { provider: "openai", model: "gpt-test" },
    openaiApiKey: "test-openai-key",
  };

  it("sends correct headers and body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: "World" } }],
    }));

    const client = createLLMClient(config)!;
    const result = await client.generate([
      { role: "system", content: "Be concise" },
      { role: "user", content: "Test" },
    ]);

    expect(result).toBe("World");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.headers["Authorization"]).toBe("Bearer test-openai-key");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-test");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be concise" });
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized", headers: { get: () => null } } as unknown as Response);
    const client = createLLMClient(config)!;
    await expect(client.generate([{ role: "user", content: "Hi" }])).rejects.toThrow("401");
  });
});

describe("groq client", () => {
  const config: GralkorConfig = {
    ...defaultConfig,
    llm: { provider: "groq", model: "llama-test" },
    groqApiKey: "test-groq-key",
  };

  it("sends to groq endpoint with Bearer auth", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: "Groq response" } }],
    }));

    const client = createLLMClient(config)!;
    const result = await client.generate([{ role: "user", content: "Test" }]);

    expect(result).toBe("Groq response");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(opts.headers["Authorization"]).toBe("Bearer test-groq-key");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("llama-test");
  });
});

describe("gemini client", () => {
  const config: GralkorConfig = {
    ...defaultConfig,
    llm: { provider: "gemini", model: "gemini-test" },
    googleApiKey: "test-gemini-key",
  };

  it("sends to gemini endpoint with key in URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: "Gemini response" }] } }],
    }));

    const client = createLLMClient(config)!;
    const result = await client.generate([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Test" },
    ], 300);

    expect(result).toBe("Gemini response");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-test:generateContent");
    expect(url).toContain("key=test-gemini-key");

    const body = JSON.parse(opts.body);
    expect(body.system_instruction).toEqual({ parts: [{ text: "You are helpful" }] });
    expect(body.generationConfig.maxOutputTokens).toBe(300);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "Test" }] });
  });

  it("maps assistant role to model for gemini", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
    }));

    const client = createLLMClient(config)!;
    await client.generate([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Question" },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[1].role).toBe("model");
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "bad request", headers: { get: () => null } } as unknown as Response);
    const client = createLLMClient(config)!;
    await expect(client.generate([{ role: "user", content: "Hi" }])).rejects.toThrow("400");
  });
});
