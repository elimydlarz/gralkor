import type { GralkorConfig } from "./config.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  generate(messages: LLMMessage[], maxTokens?: number): Promise<string>;
}

/**
 * Create an LLM client from plugin config.
 * Returns null if the configured provider has no API key set.
 */
export function createLLMClient(config: GralkorConfig): LLMClient | null {
  const provider = config.llm.provider;
  const model = config.llm.model;

  switch (provider) {
    case "anthropic": {
      const key = config.anthropicApiKey?.trim();
      if (!key) return null;
      return anthropicClient(key, model);
    }
    case "openai": {
      const key = config.openaiApiKey?.trim();
      if (!key) return null;
      return openaiCompatClient(key, model, "https://api.openai.com/v1/chat/completions");
    }
    case "groq": {
      const key = config.groqApiKey?.trim();
      if (!key) return null;
      return openaiCompatClient(key, model, "https://api.groq.com/openai/v1/chat/completions");
    }
    case "gemini":
    default: {
      const key = config.googleApiKey?.trim();
      if (!key) return null;
      return geminiClient(key, model);
    }
  }
}

function anthropicClient(apiKey: string, model: string): LLMClient {
  return {
    async generate(messages: LLMMessage[], maxTokens = 500): Promise<string> {
      const systemMsg = messages.find((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: otherMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (systemMsg) body["system"] = systemMsg.content;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Anthropic API error ${resp.status}: ${text}`);
      }

      const data = await resp.json() as { content: Array<{ type: string; text: string }> };
      return data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    },
  };
}

function openaiCompatClient(apiKey: string, model: string, url: string): LLMClient {
  return {
    async generate(messages: LLMMessage[], maxTokens = 500): Promise<string> {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`LLM API error ${resp.status}: ${text}`);
      }

      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content?.trim() ?? "";
    },
  };
}

function geminiClient(apiKey: string, model: string): LLMClient {
  return {
    async generate(messages: LLMMessage[], maxTokens = 500): Promise<string> {
      const systemMsg = messages.find((m) => m.role === "system");
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }));

      const body: Record<string, unknown> = {
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (systemMsg) {
        body["system_instruction"] = { parts: [{ text: systemMsg.content }] };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Gemini API error ${resp.status}: ${text}`);
      }

      const data = await resp.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      return data.candidates[0]?.content?.parts[0]?.text?.trim() ?? "";
    },
  };
}
