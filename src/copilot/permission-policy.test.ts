import { describe, it, expect } from "bun:test";
import { isToolAllowed, createPermissionHook } from "./permission-policy";

describe("isToolAllowed", () => {
  it.each(["emit_finding", "readFile", "searchFiles"])("allows %s", (tool) => {
    expect(isToolAllowed(tool)).toBe(true);
  });

  it.each(["shell", "bash", "editFile", "webSearch", "deleteFile"])("denies %s", (tool) => {
    expect(isToolAllowed(tool)).toBe(false);
  });
});

describe("createPermissionHook", () => {
  it("returns allow decision for permitted tools", async () => {
    const hook = createPermissionHook();
    const result = await hook({ toolName: "emit_finding" });
    expect(result.permissionDecision).toBe("allow");
  });

  it("returns deny decision for forbidden tools", async () => {
    const hook = createPermissionHook();
    const result = await hook({ toolName: "shell" });
    expect(result.permissionDecision).toBe("deny");
    expect(result.permissionDecisionReason).toBeDefined();
  });
});
