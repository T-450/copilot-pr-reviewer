const ALLOWED_TOOLS = new Set(["emit_finding", "readFile", "searchFiles"]);

export function isToolAllowed(toolName: string): boolean {
  return ALLOWED_TOOLS.has(toolName);
}

export function createPermissionHook() {
  return async (input: { toolName: string }) => {
    if (isToolAllowed(input.toolName)) {
      return { permissionDecision: "allow" as const };
    }
    return {
      permissionDecision: "deny" as const,
      permissionDecisionReason: `Tool "${input.toolName}" is not permitted. Only read-only tools and emit_finding are allowed.`,
    };
  };
}
