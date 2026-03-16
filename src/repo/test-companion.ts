import { join, dirname, basename, extname } from "node:path";
import type { TestStatus } from "../shared/types";

const TS_TEST_SUFFIXES = [".test.ts", ".spec.ts", ".test.tsx", ".spec.tsx"];
const CS_TEST_SUFFIXES = ["Tests.cs", "Test.cs", ".Tests.cs"];

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (TS_TEST_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (CS_TEST_SUFFIXES.some((s) => filePath.endsWith(s))) return true;
  if (lower.includes("/__tests__/")) return true;
  return false;
}

function candidatesForTs(filePath: string): string[] {
  const dir = dirname(filePath);
  const base = basename(filePath, extname(filePath));
  return [
    join(dir, `${base}.test.ts`),
    join(dir, `${base}.spec.ts`),
    join(dir, "__tests__", `${base}.test.ts`),
  ];
}

function candidatesForCs(filePath: string): string[] {
  // Services/AuthService.cs -> Services/AuthServiceTests.cs
  //                         -> Services/AuthServiceTest.cs
  //                         -> Services/AuthService.Tests.cs
  //                         -> Tests/Services/AuthServiceTests.cs
  //                         -> Services.Tests/AuthServiceTests.cs
  const dir = dirname(filePath);
  const base = basename(filePath, ".cs");
  return [
    join(dir, `${base}Tests.cs`),
    join(dir, `${base}Test.cs`),
    join(dir, `${base}.Tests.cs`),
    join("Tests", dir, `${base}Tests.cs`),
    `${dir}.Tests/${base}Tests.cs`,
  ];
}

function candidatePaths(filePath: string): string[] {
  if (filePath.endsWith(".cs")) return candidatesForCs(filePath);
  return candidatesForTs(filePath);
}

export async function detectTestCompanion(
  filePath: string,
  changedPaths: string[],
  repoRoot: string,
): Promise<TestStatus> {
  if (isTestFile(filePath)) return "not_applicable";

  const candidates = candidatePaths(filePath);

  // Check changedPaths first
  const changedSet = new Set(changedPaths);
  for (const candidate of candidates) {
    if (changedSet.has(candidate)) return "changed";
  }

  // Check disk existence
  for (const candidate of candidates) {
    const exists = await Bun.file(join(repoRoot, candidate)).exists();
    if (exists) return "not_changed";
  }

  return "missing";
}
