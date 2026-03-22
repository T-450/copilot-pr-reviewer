/**
 * Tool names that are always denied in automated review sessions.
 *
 * This list is referenced by both session.ts (session-level exclusion) and
 * hooks.ts (pre-tool-use hook denial) to ensure consistency without
 * circular imports.
 */
export const EXCLUDED_TOOLS: readonly string[] = [
	"edit_file",
	"write_file",
	"shell",
	"git_push",
	"web_fetch",
];
