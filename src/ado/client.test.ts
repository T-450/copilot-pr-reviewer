import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createAdoClient } from "./client";

describe("createAdoClient", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ value: [] }), { status: 200 })));
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("constructs correct URL with api-version", async () => {
    const client = createAdoClient("https://dev.azure.com/org/", "MyProject", "repo-123", "my-pat");
    await client.get("/pullRequests/1");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("_apis/git/repositories/repo-123/pullRequests/1");
    expect(url).toContain("api-version=7.1");
  });

  it("sends Basic auth header", async () => {
    const client = createAdoClient("https://dev.azure.com/org/", "MyProject", "repo-123", "my-pat");
    await client.get("/test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(`Basic ${btoa(":my-pat")}`);
  });

  it("throws AuthError on 401", async () => {
    mockFetch = mock(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
    globalThis.fetch = mockFetch as any;
    const client = createAdoClient("https://dev.azure.com/org/", "MyProject", "repo-123", "my-pat");
    await expect(client.get("/test")).rejects.toMatchObject({ name: "AuthError" });
  });

  it("retries on 429 then succeeds", async () => {
    let callCount = 0;
    mockFetch = mock(() => {
      callCount++;
      if (callCount < 3) return Promise.resolve(new Response("Too Many Requests", { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = mockFetch as any;
    const client = createAdoClient("https://dev.azure.com/org/", "MyProject", "repo-123", "my-pat", 0);
    const result = await client.get<{ ok: boolean }>("/test");
    expect(result.ok).toBe(true);
    expect(callCount).toBe(3);
  });
});
