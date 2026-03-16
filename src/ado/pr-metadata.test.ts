import { describe, expect, it } from "bun:test";
import { fetchPRMetadata } from "./pr-metadata";
import type { AdoClient, AdoPullRequest } from "./types";

function makeClient(pr: AdoPullRequest): AdoClient {
  return {
    get: <T>(_path: string) => Promise.resolve(pr as unknown as T),
    post: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
    patch: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
  };
}

describe("fetchPRMetadata", () => {
  it("maps fields correctly", async () => {
    const pr: AdoPullRequest = {
      pullRequestId: 42,
      title: "My PR",
      description: "A description",
      sourceRefName: "refs/heads/feature/my-branch",
      targetRefName: "refs/heads/main",
      createdBy: { displayName: "Jane Doe" },
      workItemRefs: [{ id: "101" }, { id: "202" }],
    };

    const result = await fetchPRMetadata(makeClient(pr), "42");

    expect(result.title).toBe("My PR");
    expect(result.description).toBe("A description");
    expect(result.author).toBe("Jane Doe");
    expect(result.sourceBranch).toBe("feature/my-branch");
    expect(result.targetBranch).toBe("main");
    expect(result.workItemIds).toEqual([101, 202]);
  });

  it("defaults description to empty string when missing", async () => {
    const pr = {
      pullRequestId: 1,
      title: "No desc",
      description: undefined as unknown as string,
      sourceRefName: "refs/heads/feat",
      targetRefName: "refs/heads/main",
      createdBy: { displayName: "Someone" },
    } as AdoPullRequest;

    const result = await fetchPRMetadata(makeClient(pr), "1");

    expect(result.description).toBe("");
  });

  it("defaults workItemIds to empty array when workItemRefs is missing", async () => {
    const pr: AdoPullRequest = {
      pullRequestId: 2,
      title: "No work items",
      description: "desc",
      sourceRefName: "refs/heads/feat",
      targetRefName: "refs/heads/main",
      createdBy: { displayName: "Someone" },
    };

    const result = await fetchPRMetadata(makeClient(pr), "2");

    expect(result.workItemIds).toEqual([]);
  });

  it("strips refs/heads/ prefix from branch names", async () => {
    const pr: AdoPullRequest = {
      pullRequestId: 3,
      title: "Branch test",
      description: "",
      sourceRefName: "refs/heads/my/nested/branch",
      targetRefName: "refs/heads/develop",
      createdBy: { displayName: "Dev" },
    };

    const result = await fetchPRMetadata(makeClient(pr), "3");

    expect(result.sourceBranch).toBe("my/nested/branch");
    expect(result.targetBranch).toBe("develop");
  });

  it("calls client.get with the correct path", async () => {
    let capturedPath = "";
    const pr: AdoPullRequest = {
      pullRequestId: 99,
      title: "T",
      description: "",
      sourceRefName: "refs/heads/a",
      targetRefName: "refs/heads/b",
      createdBy: { displayName: "X" },
    };
    const client: AdoClient = {
      get: <T>(path: string) => {
        capturedPath = path;
        return Promise.resolve(pr as unknown as T);
      },
      post: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
      patch: <T>(_path: string, _body: unknown) => Promise.resolve(undefined as unknown as T),
    };

    await fetchPRMetadata(client, "99");

    expect(capturedPath).toBe("/pullRequests/99");
  });
});
