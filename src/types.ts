/**
 * OpenClaw plugin API surface used by Gralkor.
 *
 * OpenClaw doesn't export types, so we define the subset we use here.
 * Keep in sync with the OpenClaw plugin contract documented in CLAUDE.md.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/**
 * Minimal API surface used by shared registration code (hooks, health, CLI).
 */
export interface PluginApiBase {
  /** Plugin-specific config from plugins.entries.<id>.config, validated against configSchema */
  pluginConfig?: Record<string, unknown>;
  on(event: string, handler: AnyFn): void;
  registerService(service: {
    id: string;
    start: () => void | Promise<void>;
    stop: () => void | Promise<void>;
  }): void;
  registerCli(
    registrar: (ctx: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      program: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: any;
      workspaceDir?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: any;
    }) => void | Promise<void>,
    opts?: { commands?: string[] },
  ): void;
}

/**
 * Memory-mode API — adds tool registration and runtime tools.
 *
 * registerTool is overloaded: accepts both plain tool objects and factory functions.
 */
export interface MemoryPluginApi extends PluginApiBase {
  // Plain tool object registration
  registerTool(
    tool: { name: string; description: string; parameters: unknown; execute: AnyFn },
    opts?: { optional?: boolean },
  ): void;
  // Factory function registration (used for native memory tools)
  registerTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    factory: (ctx: any) => any | any[] | null,
    opts?: { names?: string[] },
  ): void;
  runtime: {
    tools: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemorySearchTool(opts: { config: any; agentSessionKey: string }): any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemoryGetTool(opts: { config: any; agentSessionKey: string }): any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerMemoryCli(program: any): void;
    };
  };
}
