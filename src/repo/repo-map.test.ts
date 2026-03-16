import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateRepoMap } from "./repo-map";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("generateRepoMap", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "repo-map-"));
    await mkdir(join(tmpDir, "src/core"), { recursive: true });
    await mkdir(join(tmpDir, "src/utils"), { recursive: true });
    await mkdir(join(tmpDir, "node_modules/pkg"), { recursive: true });
    await writeFile(join(tmpDir, "src/index.ts"), "");
    await writeFile(join(tmpDir, "package.json"), "{}");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("generates tree output", async () => {
    const map = await generateRepoMap(tmpDir);
    expect(map).toContain("src/");
    expect(map).toContain("core/");
    expect(map).toContain("package.json");
  });

  it("skips node_modules", async () => {
    const map = await generateRepoMap(tmpDir);
    expect(map).not.toContain("node_modules");
  });

  it("respects maxDepth", async () => {
    const map = await generateRepoMap(tmpDir, 1);
    expect(map).toContain("src/");
    expect(map).not.toContain("core/");
  });
});
