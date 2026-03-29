/**
 * Tarball naming patterns:
 *   susu-eng-gralkor-memory-{version}.tgz  (make pack output)
 *   susu-eng-gralkor-{version}.tgz          (pnpm pack output)
 */
const TARBALL_PATTERNS = [
  /susu-eng-gralkor-memory-(\d+\.\d+\.\d+)\.tgz$/,
  /susu-eng-gralkor-(\d+\.\d+\.\d+)\.tgz$/,
];

/** Extract semver from a tarball filename or path. Returns null if no match. */
export function extractVersionFromTarball(filenameOrPath: string): string | null {
  const basename = filenameOrPath.split("/").pop() ?? filenameOrPath;
  for (const pattern of TARBALL_PATTERNS) {
    const match = basename.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** Extract version from an npm package reference like `@susu-eng/gralkor@19.0.4`. */
export function extractVersionFromNpmRef(ref: string): string | null {
  const match = ref.match(/@(\d+\.\d+\.\d+)$/);
  return match ? match[1] : null;
}

/** Compare two semver strings. Returns -1 (a < b), 0 (equal), or 1 (a > b). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}
