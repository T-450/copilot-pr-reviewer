import type { ChangedFile } from "../shared/types";

export async function populateDiffs(
  files: ChangedFile[],
  repoRoot: string,
  targetBranch: string,
): Promise<ChangedFile[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        // Try origin/<branch> first (pipeline); fall back to local branch (tests/local dev)
        let diff = "";
        for (const ref of [`origin/${targetBranch}`, targetBranch]) {
          try {
            const result = await Bun.$`git diff ${ref}...HEAD -- ${file.path}`
              .cwd(repoRoot)
              .quiet();
            diff = result.stdout.toString().trim();
            if (diff) break;
          } catch {
            // Try next ref
          }
        }

        if (diff) {
          return { ...file, diff };
        }

        // For new (untracked) files, read content and format as unified diff
        if (file.changeType === "add") {
          const content = await Bun.file(file.absolutePath).text();
          const lines = content.split("\n");
          const addDiff = [
            `--- /dev/null`,
            `+++ b/${file.path}`,
            `@@ -0,0 +1,${lines.length} @@`,
            ...lines.map((l) => `+${l}`),
          ].join("\n");
          return { ...file, diff: addDiff };
        }

        return file; // Leave diff empty if git diff returns nothing for an edit
      } catch {
        return file; // On error, leave diff as-is (empty)
      }
    }),
  );
}
