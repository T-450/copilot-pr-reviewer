import type { CustomAgentConfig } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Shared specialist tool scope
//
// All specialist agents are limited to read-only inspection plus the custom
// emit_finding tool.  Destructive tools (edit_file, write_file, shell, etc.)
// are excluded at the session level via `excludedTools` and are intentionally
// absent here as well.
// ---------------------------------------------------------------------------

export const SPECIALIST_TOOLS: readonly string[] = [
	"emit_finding",
	"read_file",
	"list_files",
];

// ---------------------------------------------------------------------------
// Security reviewer — OWASP-focused specialist sub-agent
// ---------------------------------------------------------------------------

const SECURITY_PROMPT = [
	"You are a security specialist. Review code for:",
	"- Authentication/authorization bypasses",
	"- Injection vulnerabilities (SQL, XSS, command injection)",
	"- Sensitive data exposure (secrets, PII, tokens)",
	"- Insecure cryptographic practices",
	"- SSRF, path traversal, and other OWASP Top 10 issues",
	"",
	"Use emit_finding for each issue. Set category to 'security' and severity to 'critical' or 'warning'.",
].join("\n");

export const securityAgentConfig: CustomAgentConfig = {
	name: "security-reviewer",
	displayName: "Security Reviewer",
	description:
		"Specialized agent for security-focused code review of HIGH_RISK files",
	prompt: SECURITY_PROMPT,
	tools: [...SPECIALIST_TOOLS],
	// `infer: true` lets the SDK auto-dispatch to this agent when conversation
	// context matches its description (e.g. security-relevant file content).
	// The inference is opaque — we cannot force dispatch programmatically.
	infer: true,
};

// ---------------------------------------------------------------------------
// Test reviewer — coverage and quality specialist sub-agent
// ---------------------------------------------------------------------------

const TEST_PROMPT = [
	"You are a testing specialist. Review code for:",
	"- Missing test coverage for new/changed code",
	"- Untested edge cases and error paths",
	"- Flaky test patterns (timing, network, random)",
	"- Test-implementation coupling (testing internals vs behavior)",
	"",
	"Use emit_finding for each issue. Set category to 'testing'.",
].join("\n");

export const testAgentConfig: CustomAgentConfig = {
	name: "test-reviewer",
	displayName: "Test Reviewer",
	description: "Specialized agent for reviewing test coverage and quality",
	prompt: TEST_PROMPT,
	tools: [...SPECIALIST_TOOLS],
	// See securityAgentConfig comment — same inference mechanism applies.
	infer: true,
};

// ---------------------------------------------------------------------------
// All review agents — convenience array for session setup
// ---------------------------------------------------------------------------

export const reviewAgents: readonly CustomAgentConfig[] = [
	securityAgentConfig,
	testAgentConfig,
];
