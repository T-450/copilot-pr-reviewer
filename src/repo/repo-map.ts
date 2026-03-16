import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "out",
  "coverage",
]);

export async function generateRepoMap(
  repoRoot: string,
  maxDepth: number = 2
): Promise<string> {
  const lines: string[] = [];

  async function walk(currentPath: string, depth: number, indent: string) {
    if (depth >= maxDepth) {
      return;
    }

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      // Sort entries for consistent output: directories first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        // Skip files/dirs that should be ignored
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }

        const entryPath = join(currentPath, entry.name);
        const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;

        lines.push(`${indent}${displayName}`);

        // Only recurse into directories
        if (entry.isDirectory()) {
          await walk(entryPath, depth + 1, indent + "  ");
        }
      }
    } catch {
      // Silently skip directories we can't read
    }
  }

  await walk(repoRoot, 0, "");
  return lines.join("\n");
}
