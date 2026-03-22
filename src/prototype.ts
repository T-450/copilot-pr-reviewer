/**
 * Standalone prototype that proves the upgraded 0.2.0 SDK foundation works
 * end to end without user input. Creates sample files in a temp directory,
 * runs the full review pipeline (session → planning → review → cluster → summary),
 * and prints real-time streaming progress plus a formatted findings report.
 *
 * Usage:  bun run prototype
 * Requires: COPILOT_GITHUB_TOKEN environment variable
 */

import {
	CopilotClient,
	approveAll,
	type SessionEvent,
} from "@github/copilot-sdk";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, meetsThreshold, type Config } from "./config.ts";
import {
	buildSystemPrompt,
	buildPlanningPrompt,
	buildFileReviewRequest,
	createEmitFindingTool,
} from "./review.ts";
import { createHooks } from "./hooks.ts";
import { configureBundledInstructionDirs } from "./instructions.ts";
import { clusterFindings } from "./cluster.ts";
import { CHANGE_TYPE_LABELS, type Finding } from "./types.ts";
import type { ChangedFile, PRMetadata } from "./ado/client.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const REVIEW_TIMEOUT = 120_000;
const PLANNING_TIMEOUT = 30_000;

const SEVERITY_ICON: Record<string, string> = {
	critical: "[CRIT]",
	warning: "[WARN]",
	suggestion: "[SUGG]",
	nitpick: "[NITS]",
};

const SAMPLE_FILES: Record<string, string> = {
	"src/auth.ts": [
		'import { createHash } from "crypto";',
		"",
		'const API_SECRET = "sk-live-hardcoded-secret-12345";',
		"",
		"export function authenticate(token: string): boolean {",
		"  if (token === API_SECRET) {",
		"    return true;",
		"  }",
		"  return false;",
		"}",
		"",
		"export function hashPassword(password: string): string {",
		'  return createHash("md5").update(password).digest("hex");',
		"}",
	].join("\n"),

	"src/api.ts": [
		"export async function fetchUser(id: string) {",
		"  const res = await fetch(`/api/users/${id}`);",
		"  const data = await res.json();",
		"  return data.name;",
		"}",
		"",
		"export async function deleteUser(id: string) {",
		"  await fetch(`/api/users/${id}`, { method: 'DELETE' });",
		"}",
	].join("\n"),

	"src/utils.ts": [
		"export function parseId(input: string): number {",
		"  return parseInt(input);",
		"}",
		"",
		"export function buildQuery(table: string, filter: string): string {",
		"  return `SELECT * FROM ${table} WHERE ${filter}`;",
		"}",
	].join("\n"),
};

function createStreamingHandler(): (event: SessionEvent) => void {
	let dotCount = 0;
	return (event) => {
		switch (event.type) {
			case "assistant.message_delta":
				dotCount++;
				if (dotCount % 5 === 0) process.stdout.write(".");
				break;
			case "assistant.message":
				if (dotCount > 0) process.stdout.write("\n");
				dotCount = 0;
				break;
			case "session.error":
				console.error(
					`  [stream error] ${(event as { data: { message: string } }).data.message}`,
				);
				break;
		}
	};
}

async function scaffoldTempDir(): Promise<string> {
	const tmpDir = await mkdtemp(join(tmpdir(), "pr-reviewer-prototype-"));

	await mkdir(join(tmpDir, ".github"), { recursive: true });
	await writeFile(
		join(tmpDir, ".github", "copilot-instructions.md"),
		"Focus on security, correctness, and reliability issues.",
	);

	await mkdir(join(tmpDir, "src"), { recursive: true });

	for (const [relPath, content] of Object.entries(SAMPLE_FILES)) {
		await writeFile(join(tmpDir, relPath), content);
	}

	await writeFile(
		join(tmpDir, ".prreviewer.yml"),
		[
			"severityThreshold: suggestion",
			"maxFiles: 10",
			"planning: true",
			"clustering: true",
			"clusterThreshold: 3",
			'reasoningEffort: "low"',
		].join("\n"),
	);

	return tmpDir;
}

function printFindingsSummary(
	findings: readonly Finding[],
	config: Config,
	clusters: readonly {
		primary: Finding;
		members: readonly Finding[];
		isClustered: boolean;
	}[],
): void {
	const reportable = findings.filter((f) =>
		meetsThreshold(f.severity, config.severityThreshold),
	);

	console.log(`\n${"=".repeat(60)}`);
	console.log("  PROTOTYPE REVIEW SUMMARY");
	console.log("=".repeat(60));
	console.log(`  Total findings:     ${findings.length}`);
	console.log(`  Above threshold:    ${reportable.length}`);
	console.log(`  Clusters:           ${clusters.length}`);

	const bySeverity = { critical: 0, warning: 0, suggestion: 0, nitpick: 0 };
	for (const f of reportable) {
		bySeverity[f.severity]++;
	}
	console.log(
		`  By severity:        critical=${bySeverity.critical}  warning=${bySeverity.warning}  suggestion=${bySeverity.suggestion}  nitpick=${bySeverity.nitpick}`,
	);

	if (reportable.length > 0) {
		console.log("\n  Findings:");
		console.log(`  ${"-".repeat(56)}`);
		for (const f of reportable) {
			const icon = SEVERITY_ICON[f.severity] ?? "[????]";
			console.log(`  ${icon} ${f.title}`);
			console.log(
				`         ${f.filePath}:${f.startLine}-${f.endLine}  (${f.category}, ${f.confidence} confidence)`,
			);
			if (f.message.length <= 120) {
				console.log(`         ${f.message}`);
			} else {
				console.log(`         ${f.message.slice(0, 117)}...`);
			}
			console.log();
		}
	}

	console.log("=".repeat(60));
}

async function runPrototype(): Promise<void> {
	const ghToken = process.env.COPILOT_GITHUB_TOKEN;
	if (!ghToken) {
		console.error(
			"ERROR: COPILOT_GITHUB_TOKEN is required. Set it and re-run.",
		);
		process.exit(1);
	}

	console.log("PR Reviewer Prototype — SDK 0.2.0 Foundation");
	console.log("=".repeat(60));

	console.log("\n[1/6] Scaffolding sample project...");
	const tmpDir = await scaffoldTempDir();
	console.log(`  Created: ${tmpDir}`);
	for (const relPath of Object.keys(SAMPLE_FILES)) {
		console.log(`  + ${relPath}`);
	}

	console.log("\n[2/6] Loading config...");
	const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
	console.log(
		`  severityThreshold=${config.severityThreshold}  reasoningEffort=${config.reasoningEffort}  planning=${config.planning}  clustering=${config.clustering}`,
	);

	const pr: PRMetadata = {
		title: "Add auth, API, and utility modules",
		description:
			"Introduces authentication with password hashing, user API endpoints, and SQL query utilities.",
		workItemIds: [101],
	};

	const files: ChangedFile[] = Object.keys(SAMPLE_FILES).map((path, idx) => ({
		path,
		changeType: 1,
		changeTrackingId: idx + 1,
	}));

	console.log("\n[3/6] Creating Copilot SDK session...");
	configureBundledInstructionDirs();

	const client = new CopilotClient({ cwd: tmpDir });
	await client.start();

	const findings: Finding[] = [];
	const emitFinding = createEmitFindingTool(findings);

	const session = await client.createSession({
		sessionId: `prototype-${Date.now()}`,
		model: process.env.COPILOT_MODEL ?? "gpt-4.1",
		reasoningEffort: config.reasoningEffort,
		streaming: true,
		tools: [emitFinding],
		excludedTools: [
			"edit_file",
			"write_file",
			"shell",
			"git_push",
			"web_fetch",
		],
		infiniteSessions: {
			backgroundCompactionThreshold: 0.85,
			enabled: true,
			bufferExhaustionThreshold: 0.7,
		},
		customAgents: [],
		hooks: createHooks(),
		systemMessage: {
			content: buildSystemPrompt(pr, config),
			mode: "append",
		},
		onPermissionRequest: approveAll,
		onEvent: createStreamingHandler(),
		workingDirectory: tmpDir,
	});

	console.log("  Session created successfully");
	console.log(
		`  Model: ${process.env.COPILOT_MODEL ?? "gpt-4.1"}  Reasoning: ${config.reasoningEffort}`,
	);

	try {
		console.log("\n[4/6] Planning review strategy...");
		const planStart = performance.now();
		await session.sendAndWait(
			{ prompt: buildPlanningPrompt(pr, files) },
			PLANNING_TIMEOUT,
		);
		const planMs = Math.round(performance.now() - planStart);
		console.log(`  Planning complete (${planMs}ms)`);

		console.log("\n[5/6] Reviewing files...");
		const reviewStart = performance.now();
		for (const file of files) {
			const changeLabel = CHANGE_TYPE_LABELS[file.changeType] ?? "unknown";

			const fileStart = performance.now();
			process.stdout.write(`  ${file.path} (${changeLabel}) `);

			await session.sendAndWait(
				buildFileReviewRequest(file.path, changeLabel, join(tmpDir, file.path)),
				REVIEW_TIMEOUT,
			);

			const fileMs = Math.round(performance.now() - fileStart);
			const newFindings = findings.filter(
				(f) => f.filePath === file.path || f.filePath.endsWith(file.path),
			);
			console.log(`  => ${newFindings.length} findings (${fileMs}ms)`);
		}
		const reviewMs = Math.round(performance.now() - reviewStart);
		console.log(`  All files reviewed (${reviewMs}ms total)`);

		console.log("\n[6/6] Clustering and summarizing...");
		const reportable = findings.filter((f) =>
			meetsThreshold(f.severity, config.severityThreshold),
		);

		const clusters = config.clustering
			? clusterFindings(reportable, config.clusterThreshold)
			: reportable.map((f) => ({
					primary: f,
					members: [f] as readonly Finding[],
					clusterFingerprint: f.fingerprint,
					isClustered: false,
				}));

		printFindingsSummary(findings, config, clusters);

		console.log("\nPrototype completed successfully.");
	} finally {
		await session.disconnect();
		await client.stop();
		await rm(tmpDir, { recursive: true, force: true });
		console.log(`Cleaned up: ${tmpDir}`);
	}
}

runPrototype().catch((err) => {
	console.error(
		`Prototype failed: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
