import { describe, it, expect } from "bun:test";
import { filterFiles } from "./file-filter";
import type { ChangedFile, ReviewConfig } from "../shared/types";

const makeFile = (path: string, riskLevel: ChangedFile["riskLevel"] = "NORMAL"): ChangedFile => ({
  path, absolutePath: `/repo/${path}`, diff: "diff", changeType: "edit",
  changeTrackingId: 1, currentIteration: 1, previousIteration: 0,
  riskLevel, testStatus: "not_applicable",
});

const defaultConfig: ReviewConfig = {
  ignore: [], severityThreshold: "suggestion", maxFiles: 50, securityOverrides: [],
};

describe("filterFiles", () => {
  it("excludes files matching ignore patterns", () => {
    const files = [makeFile("src/index.ts"), makeFile("README.md")];
    const config = { ...defaultConfig, ignore: ["*.md"] };
    const { included } = filterFiles(files, config);
    expect(included).toHaveLength(1);
    expect(included[0].path).toBe("src/index.ts");
  });

  it("caps at maxFiles", () => {
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`file${i}.ts`));
    const config = { ...defaultConfig, maxFiles: 3 };
    const { included, skipped } = filterFiles(files, config);
    expect(included).toHaveLength(3);
    expect(skipped).toHaveLength(7);
  });

  it("prioritizes HIGH_RISK files when capping", () => {
    const files = [
      makeFile("normal1.ts", "NORMAL"),
      makeFile("auth.ts", "HIGH_RISK"),
      makeFile("normal2.ts", "NORMAL"),
    ];
    const config = { ...defaultConfig, maxFiles: 2 };
    const { included } = filterFiles(files, config);
    expect(included.some(f => f.path === "auth.ts")).toBe(true);
  });

  it("excludes binary file extensions as a secondary defense", () => {
    const files = [
      makeFile("src/index.ts"),
      makeFile("assets/logo.png"),
      makeFile("fonts/inter.woff2"),
      makeFile("dist/app.dll"),
    ];
    const { included, skipped } = filterFiles(files, defaultConfig);
    expect(included).toHaveLength(1);
    expect(included[0].path).toBe("src/index.ts");
    expect(skipped).toHaveLength(3);
  });
});
