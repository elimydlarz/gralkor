export const GRALKOR_MARKER = "<!-- GRALKOR:INDEXED -->";

export interface DiscoveredFile {
  absPath: string;
  relPath: string;
  groupId: string;
}

export async function discoverFiles(_workspaceDir: string): Promise<DiscoveredFile[]> {
  throw new Error("not implemented");
}

export async function indexFile(_client: unknown, _file: DiscoveredFile): Promise<boolean> {
  throw new Error("not implemented");
}

export async function runNativeIndexer(_client: unknown, _config: unknown): Promise<void> {
  throw new Error("not implemented");
}
