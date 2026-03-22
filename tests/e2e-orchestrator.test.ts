import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, meetsThreshold } from "../src/config.ts";
import {
	buildSystemPrompt,
	buildFileReviewRequest,
	buildPlanningPrompt,
	createEmitFindingTool,
} from "../src/review.ts";
import { createHooks } from "../src/hooks.ts";
import { clusterFindings } from "../src/cluster.ts";
import {
	reconcile,
	type BotThread,
	type ChangedFile,
} from "../src/ado/client.ts";
import type { Finding } from "../src/types.ts";

const HAS_TOKEN = !!process.env.COPILOT_GITHUB_TOKEN;

describe.skipIf(!HAS_TOKEN)("E2E orchestrator flow", () => {
	let tmpDir: string;
	let client: CopilotClient;

	beforeAll(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "e2e-test-"));

		await mkdir(join(tmpDir, ".github"), { recursive: true });
		await writeFile(
			join(tmpDir, ".github", "copilot-instructions.md"),
			"Focus on security and correctness issues.",
		);

		// Seed 3 files with varying issues
		await mkdir(join(tmpDir, "src"), { recursive: true });

		await writeFile(
			join(tmpDir, "src", "auth.ts"),
			[
				'import { hash } from "crypto";',
				"",
				'const SECRET = "hardcoded-secret-key";',
				"",
				"export function authenticate(token: string): boolean {",
				"  if (token === SECRET) {",
				"    return true;",
				"  }",
				"  return false;",
				"}",
			].join("\n"),
		);

		await writeFile(
			join(tmpDir, "src", "api.ts"),
			[
				"export async function fetchData(url: string) {",
				"  const res = await fetch(url);",
				"  const data = await res.json();",
				"  return data;",
				"}",
			].join("\n"),
		);

		await writeFile(
			join(tmpDir, "src", "utils.ts"),
			[
				"export function parseId(input: string): number {",
				"  return parseInt(input);",
				"}",
				"",
				"export function formatDate(d: Date): string {",
				"  return d.toISOString();",
				"}",
			].join("\n"),
		);

		// Config file
		await writeFile(
			join(tmpDir, ".prreviewer.yml"),
			[
				"severityThreshold: suggestion",
				"maxFiles: 10",
				"planning: true",
				"clustering: true",
				"clusterThreshold: 3",
			].join("\n"),
		);

		client = new CopilotClient({ cwd: tmpDir });
		await client.start();
	});

	afterAll(async () => {
		if (client) await client.stop().catch(() => {});
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
	});

	test("full review pipeline: config → plan → review → cluster → reconcile", async () => {
		// 1. Load config
		const config = await loadConfig(join(tmpDir, ".prreviewer.yml"));
		expect(config.severityThreshold).toBe("suggestion");

		// 2. Simulate PR metadata
		const pr = {
			title: "Add auth and API modules",
			description: "New authentication and data fetching",
			workItemIds: [42],
		};

		// 3. Simulate iteration diff
		const files: ChangedFile[] = [
			{ path: "src/auth.ts", changeType: 1, changeTrackingId: 1 },
			{ path: "src/api.ts", changeType: 1, changeTrackingId: 2 },
			{ path: "src/utils.ts", changeType: 1, changeTrackingId: 3 },
		];

		// 4. Create session with full config
		const findings: Finding[] = [];
		const emitFinding = createEmitFindingTool(findings);

		const session = await client.createSession({
			sessionId: `e2e-test-${Date.now()}`,
			model: "gpt-4.1",
			tools: [emitFinding],
			excludedTools: ["edit_file", "write_file", "shell", "git_push"],
			hooks: createHooks(),
			systemMessage: { content: buildSystemPrompt(pr, config) },
			onPermissionRequest: approveAll,
			workingDirectory: tmpDir,
		});

		try {
			// 5. Planning phase
			const planResponse = await session.sendAndWait(
				{ prompt: buildPlanningPrompt(pr, files) },
				30_000,
			);
			expect(planResponse).toBeDefined();
			console.log("Planning complete");

			// 6. Review each file using attachment-first requests (file content
			//    is delivered via SDK attachment, not injected into the prompt).
			for (const file of files) {
				const label = file.changeType === 1 ? "add" : "edit";
				console.log(`  Reviewing ${file.path}...`);
				await session.sendAndWait(
					buildFileReviewRequest(file.path, label, join(tmpDir, file.path)),
					60_000,
				);
			}

			// 7. Filter by threshold
			const filtered = findings.filter((f) =>
				meetsThreshold(f.severity, config.severityThreshold),
			);
			console.log(
				`  Findings: ${findings.length} total, ${filtered.length} above threshold`,
			);
			expect(filtered.length).toBeGreaterThanOrEqual(1);

			// 8. Cluster
			const clusters = clusterFindings(filtered, config.clusterThreshold);
			console.log(`  Clusters: ${clusters.length}`);
			expect(clusters.length).toBeGreaterThanOrEqual(1);

			// 9. Reconcile (no existing threads)
			const allFindings = clusters.flatMap((c) =>
				c.isClustered ? [c.primary] : c.members,
			);
			const { pendingThreads: toPost, threadsForReview: toResolve } = reconcile(
				[],
				allFindings,
				files,
			);
			expect(toPost.length).toBe(allFindings.length);
			expect(toResolve).toHaveLength(0);

			// 10. Reconcile with simulated existing threads
			const existingThreads: BotThread[] = [
				{
					id: 100,
					filePath: "src/auth.ts",
					fingerprint: allFindings[0]?.fingerprint ?? "none",
					status: 1,
				},
			];
			const result2 = reconcile(existingThreads, allFindings, files);
			// First finding should be skipped (already exists)
			expect(result2.pendingThreads.length).toBe(allFindings.length - 1);

			// Print summary
			console.log("\n=== E2E Review Summary ===");
			console.log(`Files reviewed: ${files.length}`);
			console.log(`Total findings: ${findings.length}`);
			console.log(`Above threshold: ${filtered.length}`);
			console.log(`Clusters: ${clusters.length}`);
			console.log(`New comments: ${toPost.length}`);
			console.log(`Resolved: ${toResolve.length}`);
			for (const f of filtered) {
				console.log(
					`  [${f.severity}] ${f.title} (${f.filePath}:${f.startLine})`,
				);
			}
		} finally {
			await session.disconnect();
		}
	}, 180_000);
});
