/**
 * Secret resolution — resolves API key config values to plain strings via
 * the OpenClaw secret-input SDK. Lazy-loads SDK modules at runtime (not
 * available at build time).
 */

export type SecretInputSDK = {
  normalizeSecretInput: (input: unknown) => string | undefined;
  normalizeResolvedSecretInputString: (opts: { value: unknown; path: string }) => unknown;
};

let sdkPromise: Promise<SecretInputSDK> | null = null;

function defaultLoadSecretInputSDK(): Promise<SecretInputSDK> {
  const sdkBase = "openclaw/plugin-sdk";
  sdkPromise ??= import(/* @vite-ignore */ `${sdkBase}/secret-input`).then((mod) => ({
    normalizeSecretInput: mod.normalizeSecretInput,
    normalizeResolvedSecretInputString: mod.normalizeResolvedSecretInputString,
  }));
  return sdkPromise;
}

let sdkLoader: () => Promise<SecretInputSDK> = defaultLoadSecretInputSDK;

/** Replace the SDK loader (for testing). */
export function setSecretInputSDKLoader(loader: () => Promise<SecretInputSDK>): void {
  sdkLoader = loader;
  sdkPromise = null;
}

/** Reset to the default SDK loader (for testing). */
export function resetSecretInputSDKLoader(): void {
  sdkLoader = defaultLoadSecretInputSDK;
  sdkPromise = null;
}

/** Map of config field name to environment variable name. */
export const SECRET_ENV_MAP: Record<string, string> = {
  googleApiKey: "GOOGLE_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  groqApiKey: "GROQ_API_KEY",
};

export interface SecretFields {
  googleApiKey?: unknown;
  openaiApiKey?: unknown;
  anthropicApiKey?: unknown;
  groqApiKey?: unknown;
}

/**
 * Resolve secret config values to a Record<string, string> of env vars
 * suitable for passing to the child process.
 */
export async function resolveSecretEnv(secrets: SecretFields): Promise<Record<string, string>> {
  const { normalizeSecretInput, normalizeResolvedSecretInputString } = await sdkLoader();
  const env: Record<string, string> = {};

  for (const [field, envVar] of Object.entries(SECRET_ENV_MAP)) {
    const raw = secrets[field as keyof SecretFields];
    if (raw == null) continue;

    const resolved =
      normalizeSecretInput(
        normalizeResolvedSecretInputString({ value: raw, path: field })
      ) || undefined;

    if (resolved) {
      env[envVar] = resolved;
    }
  }

  return env;
}
