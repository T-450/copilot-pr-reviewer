import { describe, expect, test } from "bun:test";
import type { CustomAgentConfig } from "@github/copilot-sdk";
import {
	buildSessionConfig,
	getExcludedTools,
	type SessionConfigInputs,
} from "../src/session.ts";
import { SPECIALIST_TOOLS, reviewAgents } from "../src/prompts/index.ts";
import { createEmitFindingTool } from "../src/review.ts";
import type { Finding } from "../src/types.ts";
import type { PRMetadata } from "../src/ado/client.ts";
import type { Config } from "../src/config.ts";

// ── Shared fixtures ─────────────────────────────────────────────────────────

const defaultConfig: Config = {
	ignore: [],
	severityThreshold: "suggestion",
	maxFiles: 30,
	planning: true,
	clustering: true,
	clusterThreshold: 3,
	reasoningEffort: "low",
};

const samplePR: PRMetadata = {
	title: "Test PR",
	description: "Test description",
	workItemIds: [],
};

function makeInputs(
	overrides: Partial<SessionConfigInputs> = {},
): SessionConfigInputs {
	const findings: Finding[] = [];
	return {
		repoId: "repo-1",
		prId: "42",
		iteration: 1,
		pr: samplePR,
		config: defaultConfig,
		tools: [createEmitFindingTool(findings)],
		repoRoot: "/tmp/test-repo",
		...overrides,
	};
}

// ── Specialist registration ─────────────────────────────────────────────────

describe("specialist registration via buildSessionConfig", () => {
	test("default config includes both specialist agents", () => {
		const cfg = buildSessionConfig(makeInputs());

		expect(cfg.customAgents).toBeDefined();
		expect(cfg.customAgents).toHaveLength(2);
	});

	test("security-reviewer is registered with correct name", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		const security = agents.find((a) => a.name === "security-reviewer");
		expect(security).toBeDefined();
	});

	test("test-reviewer is registered with correct name", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		const testAgent = agents.find((a) => a.name === "test-reviewer");
		expect(testAgent).toBeDefined();
	});

	test("both specialists have infer enabled for SDK auto-dispatch", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		for (const agent of agents) {
			expect(agent.infer).toBe(true);
		}
	});

	test("both specialists have displayName set", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		const names = agents.map((a) => a.displayName ?? "");
		expect(names).toContain("Security Reviewer");
		expect(names).toContain("Test Reviewer");
	});

	test("registered agents match the canonical reviewAgents array", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		expect(agents).toHaveLength(reviewAgents.length);
		for (let i = 0; i < reviewAgents.length; i++) {
			expect(agents[i].name).toBe(reviewAgents[i].name);
			expect(agents[i].prompt).toBe(reviewAgents[i].prompt);
			expect(agents[i].description ?? "").toBe(
				reviewAgents[i].description ?? "",
			);
		}
	});
});

// ── Specialist tool scope ───────────────────────────────────────────────────

describe("specialist allowed-tool scope", () => {
	test("security-reviewer tools match SPECIALIST_TOOLS", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];
		const security = agents.find((a) => a.name === "security-reviewer")!;

		expect(security.tools).toEqual([...SPECIALIST_TOOLS]);
	});

	test("test-reviewer tools match SPECIALIST_TOOLS", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];
		const testAgent = agents.find((a) => a.name === "test-reviewer")!;

		expect(testAgent.tools).toEqual([...SPECIALIST_TOOLS]);
	});

	test("specialist tools include emit_finding for reporting", () => {
		expect(SPECIALIST_TOOLS).toContain("emit_finding");
	});

	test("specialist tools include read_file for inspection", () => {
		expect(SPECIALIST_TOOLS).toContain("read_file");
	});

	test("specialist tools exclude every session-level excluded tool", () => {
		const excluded = getExcludedTools();
		for (const tool of excluded) {
			expect(SPECIALIST_TOOLS).not.toContain(tool);
		}
	});

	test("no specialist has tools outside the shared SPECIALIST_TOOLS set", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];
		const allowed = new Set<string>(SPECIALIST_TOOLS);

		for (const agent of agents) {
			const tools: string[] = agent.tools ?? [];
			for (const tool of tools) {
				expect(allowed.has(tool)).toBe(true);
			}
		}
	});
});

// ── Session-level excluded tools ────────────────────────────────────────────

describe("session-level excluded tools", () => {
	test("excludedTools contains all five destructive tools", () => {
		const cfg = buildSessionConfig(makeInputs());
		const excluded = cfg.excludedTools as string[];

		for (const tool of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			expect(excluded).toContain(tool);
		}
	});

	test("excludedTools matches getExcludedTools() canonical list", () => {
		const cfg = buildSessionConfig(makeInputs());
		expect(cfg.excludedTools).toEqual([...getExcludedTools()]);
	});

	test("excludedTools is a fresh array copy (not the same reference)", () => {
		const cfg1 = buildSessionConfig(makeInputs());
		const cfg2 = buildSessionConfig(makeInputs());
		expect(cfg1.excludedTools).not.toBe(cfg2.excludedTools);
		expect(cfg1.excludedTools).toEqual(cfg2.excludedTools!);
	});
});

// ── Agent override and fallback ─────────────────────────────────────────────

describe("specialist fallback and override behavior", () => {
	test("caller can override agents with a custom list", () => {
		const customAgent: CustomAgentConfig = {
			name: "custom-reviewer",
			description: "A custom agent",
			prompt: "Review for custom things",
			tools: ["emit_finding"],
			infer: false,
		};

		const cfg = buildSessionConfig(makeInputs({ agents: [customAgent] }));
		const agents = cfg.customAgents as CustomAgentConfig[];

		expect(agents).toHaveLength(1);
		expect(agents[0].name).toBe("custom-reviewer");
	});

	test("empty agents array produces session with no specialists", () => {
		const cfg = buildSessionConfig(makeInputs({ agents: [] }));
		const agents = cfg.customAgents as CustomAgentConfig[];

		expect(agents).toHaveLength(0);
	});

	test("session config is valid when specialists are absent", () => {
		const cfg = buildSessionConfig(makeInputs({ agents: [] }));

		// Core session properties remain intact
		expect(cfg.sessionId).toBeDefined();
		expect(cfg.model).toBeDefined();
		expect(cfg.tools).toBeDefined();
		expect(cfg.excludedTools).toBeDefined();
		expect(cfg.hooks).toBeDefined();
		expect(cfg.systemMessage).toBeDefined();
		expect(cfg.onPermissionRequest).toBeDefined();
	});

	test("main review session keeps working without specialists", () => {
		const cfg = buildSessionConfig(makeInputs({ agents: [] }));

		// System message still contains review instructions
		const systemContent =
			typeof cfg.systemMessage === "object" && cfg.systemMessage !== null
				? (cfg.systemMessage as { content: string }).content
				: "";
		expect(systemContent).toContain("emit_finding");
	});

	test("custom agents array is a fresh copy, not a shared reference", () => {
		const cfg1 = buildSessionConfig(makeInputs());
		const cfg2 = buildSessionConfig(makeInputs());

		expect(cfg1.customAgents).not.toBe(cfg2.customAgents);
		expect(cfg1.customAgents).toEqual(cfg2.customAgents!);
	});
});

// ── Session identity and model wiring ───────────────────────────────────────

describe("session config identity and model", () => {
	test("sessionId encodes repo, PR, and iteration", () => {
		const cfg = buildSessionConfig(
			makeInputs({ repoId: "myrepo", prId: "99", iteration: 3 }),
		);
		expect(cfg.sessionId).toBe("review-myrepo-99-3");
	});

	test("model defaults to gpt-4.1 when env is unset", () => {
		const original = process.env.COPILOT_MODEL;
		delete process.env.COPILOT_MODEL;

		const cfg = buildSessionConfig(makeInputs());
		expect(cfg.model).toBe("gpt-4.1");

		if (original !== undefined) process.env.COPILOT_MODEL = original;
	});

	test("model can be overridden via inputs", () => {
		const cfg = buildSessionConfig(makeInputs({ model: "gpt-4o" }));
		expect(cfg.model).toBe("gpt-4o");
	});

	test("reasoningEffort flows from config", () => {
		const cfg = buildSessionConfig(
			makeInputs({ config: { ...defaultConfig, reasoningEffort: "high" } }),
		);
		expect(cfg.reasoningEffort).toBe("high");
	});

	test("workingDirectory uses repoRoot when provided", () => {
		const cfg = buildSessionConfig(makeInputs({ repoRoot: "/custom/path" }));
		expect(cfg.workingDirectory).toBe("/custom/path");
	});

	test("streaming is enabled", () => {
		const cfg = buildSessionConfig(makeInputs());
		expect(cfg.streaming).toBe(true);
	});
});

// ── Double-safety: specialist + session exclusion coherence ─────────────────

describe("specialist and session exclusion coherence", () => {
	test("every destructive tool is blocked at both session and specialist level", () => {
		const cfg = buildSessionConfig(makeInputs());
		const excluded = new Set(cfg.excludedTools as string[]);
		const agents: CustomAgentConfig[] =
			(cfg.customAgents as CustomAgentConfig[]) ?? [];

		for (const banned of [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		]) {
			// Blocked at session level
			expect(excluded.has(banned)).toBe(true);

			// Not present in any specialist's allowed tools
			for (const agent of agents) {
				const tools: string[] = agent.tools ?? [];
				expect(tools).not.toContain(banned);
			}
		}
	});

	test("specialist prompts instruct using emit_finding", () => {
		const cfg = buildSessionConfig(makeInputs());
		const agents = cfg.customAgents as CustomAgentConfig[];

		for (const agent of agents) {
			expect(agent.prompt).toContain("emit_finding");
		}
	});
});
