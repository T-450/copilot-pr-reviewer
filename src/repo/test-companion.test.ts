import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { detectTestCompanion } from "./test-companion";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("detectTestCompanion", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-companion-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns 'changed' when source and test both in changedPaths", async () => {
    const changedPaths = ["src/auth/login.ts", "src/auth/login.test.ts"];
    const result = await detectTestCompanion("src/auth/login.ts", changedPaths, tmpDir);
    expect(result).toBe("changed");
  });

  it("returns 'not_changed' when test exists on disk but not in changedPaths", async () => {
    await mkdir(join(tmpDir, "src/auth"), { recursive: true });
    await writeFile(join(tmpDir, "src/auth/login.test.ts"), "");
    const changedPaths = ["src/auth/login.ts"];
    const result = await detectTestCompanion("src/auth/login.ts", changedPaths, tmpDir);
    expect(result).toBe("not_changed");
  });

  it("returns 'missing' when no test exists anywhere", async () => {
    const changedPaths = ["src/auth/login.ts"];
    const result = await detectTestCompanion("src/auth/login.ts", changedPaths, tmpDir);
    expect(result).toBe("missing");
  });

  it("returns 'not_applicable' for test files themselves", async () => {
    const changedPaths = ["src/auth/login.test.ts"];
    const result = await detectTestCompanion("src/auth/login.test.ts", changedPaths, tmpDir);
    expect(result).toBe("not_applicable");
  });

  it("detects C# test file in parallel Tests/ directory", async () => {
    await mkdir(join(tmpDir, "Tests/Services"), { recursive: true });
    await writeFile(join(tmpDir, "Tests/Services/AuthServiceTests.cs"), "");
    const changedPaths = ["Services/AuthService.cs"];
    const result = await detectTestCompanion("Services/AuthService.cs", changedPaths, tmpDir);
    expect(result).toBe("not_changed");
  });

  it("detects C# test file in same directory (FooTests.cs)", async () => {
    await mkdir(join(tmpDir, "Services"), { recursive: true });
    await writeFile(join(tmpDir, "Services/AuthServiceTests.cs"), "");
    const changedPaths = ["Services/AuthService.cs"];
    const result = await detectTestCompanion("Services/AuthService.cs", changedPaths, tmpDir);
    expect(result).toBe("not_changed");
  });

  it("detects C# test file in changedPaths (FooTest.cs pattern)", async () => {
    const changedPaths = ["Services/AuthService.cs", "Services/AuthServiceTest.cs"];
    const result = await detectTestCompanion("Services/AuthService.cs", changedPaths, tmpDir);
    expect(result).toBe("changed");
  });

  it("returns 'not_applicable' for C# test files (Tests.cs suffix)", async () => {
    const changedPaths = ["Services/AuthServiceTests.cs"];
    const result = await detectTestCompanion("Services/AuthServiceTests.cs", changedPaths, tmpDir);
    expect(result).toBe("not_applicable");
  });

  it("returns 'not_applicable' for C# test files (Test.cs suffix)", async () => {
    const changedPaths = ["Services/AuthServiceTest.cs"];
    const result = await detectTestCompanion("Services/AuthServiceTest.cs", changedPaths, tmpDir);
    expect(result).toBe("not_applicable");
  });

  it("returns 'not_applicable' for C# test files (.Tests.cs suffix)", async () => {
    const changedPaths = ["Services/AuthService.Tests.cs"];
    const result = await detectTestCompanion("Services/AuthService.Tests.cs", changedPaths, tmpDir);
    expect(result).toBe("not_applicable");
  });
});
