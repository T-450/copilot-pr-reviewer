import { describe, expect, it } from "bun:test";
import { fetchIncrementalChanges } from "./iteration-diff";
import type { AdoClient, AdoIteration, AdoIterationChange } from "./types";

type IterationsResponse = { value: AdoIteration[] };
type ChangesResponse = { changeEntries: AdoIterationChange[] };

function makeClient(
  iterations: AdoIteration[],
  changes: AdoIterationChange[],
  capturedPaths?: string[],
): AdoClient {
  return {
    get: <T>(path: string) => {
      capturedPaths?.push(path);
      if (path.includes("/iterations") && !path.includes("changes")) {
        return Promise.resolve({ value: iterations } as unknown as T);
      }
      return Promise.resolve({ changeEntries: changes } as unknown as T);
    },
    post: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
    patch: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
  };
}

function makeIteration(id: number): AdoIteration {
  return { id, description: `Iteration ${id}`, createdDate: "2024-01-01" };
}

function makeChange(
  id: number,
  changeType: AdoIterationChange["changeType"],
  path: string,
): AdoIterationChange {
  return { changeTrackingId: id, changeType, item: { path } };
}

describe("fetchIncrementalChanges", () => {
  it("3 iterations → diffs latest (3) vs previous (2)", async () => {
    const capturedPaths: string[] = [];
    const client = makeClient(
      [makeIteration(1), makeIteration(2), makeIteration(3)],
      [makeChange(1, "edit", "/src/foo.ts")],
      capturedPaths,
    );

    const result = await fetchIncrementalChanges(client, "42", "/repo");

    expect(capturedPaths).toContain("/pullRequests/42/iterations");
    expect(capturedPaths).toContain(
      "/pullRequests/42/iterations/3/changes?compareTo=2",
    );
    expect(result[0].currentIteration).toBe(3);
    expect(result[0].previousIteration).toBe(2);
  });

  it("1 iteration → compareTo is 0", async () => {
    const capturedPaths: string[] = [];
    const client = makeClient(
      [makeIteration(1)],
      [makeChange(1, "add", "/src/new.ts")],
      capturedPaths,
    );

    const result = await fetchIncrementalChanges(client, "7", "/repo");

    expect(capturedPaths).toContain(
      "/pullRequests/7/iterations/1/changes?compareTo=0",
    );
    expect(result[0].currentIteration).toBe(1);
    expect(result[0].previousIteration).toBe(0);
  });

  it("excludes renamed files", async () => {
    const client = makeClient(
      [makeIteration(1)],
      [
        makeChange(1, "rename", "/src/renamed.ts"),
        makeChange(2, "edit", "/src/kept.ts"),
      ],
    );

    const result = await fetchIncrementalChanges(client, "1", "/repo");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/kept.ts");
  });

  it("excludes deleted files", async () => {
    const client = makeClient(
      [makeIteration(1)],
      [
        makeChange(1, "delete", "/src/gone.ts"),
        makeChange(2, "add", "/src/new.ts"),
      ],
    );

    const result = await fetchIncrementalChanges(client, "1", "/repo");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/new.ts");
  });

  it("excludes binary files", async () => {
    const binaryFiles = [
      "/assets/image.png",
      "/assets/photo.jpg",
      "/assets/photo.jpeg",
      "/assets/anim.gif",
      "/assets/icon.bmp",
      "/assets/favicon.ico",
      "/assets/logo.svg",
      "/fonts/font.woff",
      "/fonts/font.woff2",
      "/fonts/font.ttf",
      "/fonts/font.eot",
      "/audio/sound.mp3",
      "/video/clip.mp4",
      "/archive.zip",
      "/archive.tar",
      "/archive.tar.gz",
      "/lib/native.dll",
      "/bin/app.exe",
      "/data/blob.bin",
      "/doc/manual.pdf",
    ];

    const changes = binaryFiles.map((path, i) => makeChange(i + 1, "add", path));
    changes.push(makeChange(999, "add", "/src/code.ts"));

    const client = makeClient([makeIteration(1)], changes);

    const result = await fetchIncrementalChanges(client, "1", "/repo");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/code.ts");
  });

  it("includes add and edit files with correct fields", async () => {
    const client = makeClient(
      [makeIteration(2), makeIteration(3)],
      [
        makeChange(10, "add", "/src/new-file.ts"),
        makeChange(11, "edit", "/src/existing.ts"),
      ],
    );

    const result = await fetchIncrementalChanges(client, "5", "/repo");

    expect(result).toHaveLength(2);

    const added = result.find((f) => f.path === "src/new-file.ts")!;
    expect(added.changeType).toBe("add");
    expect(added.changeTrackingId).toBe(10);
    expect(added.absolutePath).toBe("/repo/src/new-file.ts");
    expect(added.diff).toBe("");
    expect(added.riskLevel).toBe("NORMAL");
    expect(added.testStatus).toBe("not_applicable");

    const edited = result.find((f) => f.path === "src/existing.ts")!;
    expect(edited.changeType).toBe("edit");
    expect(edited.changeTrackingId).toBe(11);
    expect(edited.absolutePath).toBe("/repo/src/existing.ts");
  });
});
