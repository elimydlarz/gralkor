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
  on(event: string, handler: AnyFn): void;
  registerService(service: {
    id: string;
    start: () => void;
    stop: () => void;
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
 * Tool-mode API — adds plain-object tool registration.
 */
export interface ToolPluginApi extends PluginApiBase {
  registerTool(
    tool: { name: string; description: string; parameters: unknown; execute: AnyFn },
    opts?: { optional?: boolean },
  ): void;
}

/**
 * Memory-mode API — adds factory-based tool registration and runtime tools.
 *
 * registerTool is overloaded: accepts both plain tool objects and factory functions.
 * Cannot extend ToolPluginApi because TypeScript doesn't allow narrowing overloads
 * via interface extension — both signatures must be declared together.
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
