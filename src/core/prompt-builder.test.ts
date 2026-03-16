import { describe, it, expect } from "bun:test";
import { buildSystemMessage } from "./prompt-builder";
import type { PrMetadata, ReviewConfig } from "../shared/types";

const prMeta: PrMetadata = {
  title: "Add user validation",
  description: "Adds input validation to the user creation endpoint",
  author: "alice",
  sourceBranch: "feat/validation",
  targetBranch: "main",
  workItemIds: [1234, 5678],
};

const config: ReviewConfig = {
  ignore: [],
  severityThreshold: "suggestion",
  maxFiles: 50,
  securityOverrides: [],
};

describe("buildSystemMessage", () => {
  it("includes PR title and description", () => {
    const msg = buildSystemMessage(prMeta, config, "src/\n  index.ts");
    expect(msg).toContain("Add user validation");
    expect(msg).toContain("Adds input validation");
  });

  it("includes severity definitions", () => {
    const msg = buildSystemMessage(prMeta, config, "");
    expect(msg).toContain("critical");
    expect(msg).toContain("warning");
    expect(msg).toContain("suggestion");
    expect(msg).toContain("nitpick");
  });

  it("includes repo map", () => {
    const msg = buildSystemMessage(prMeta, config, "src/\n  index.ts\n  core/");
    expect(msg).toContain("src/");
    expect(msg).toContain("index.ts");
  });

  it("includes work items when present", () => {
    const msg = buildSystemMessage(prMeta, config, "");
    expect(msg).toContain("1234");
    expect(msg).toContain("5678");
  });

  it("omits work items section when empty", () => {
    const noWorkItems = { ...prMeta, workItemIds: [] };
    const msg = buildSystemMessage(noWorkItems, config, "");
    expect(msg).not.toContain("Work Items");
  });
});
