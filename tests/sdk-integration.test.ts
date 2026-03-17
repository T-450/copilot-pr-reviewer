import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEmitFindingTool } from "../src/review.ts";
import type { Finding } from "../src/types.ts";

const HAS_TOKEN = !!process.env.COPILOT_GITHUB_TOKEN;

describe.skipIf(!HAS_TOKEN)("SDK integration", () => {
	let tmpDir: string;
	let client: CopilotClient;

	beforeAll(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "copilot-test-"));

		// Create .github/copilot-instructions.md
		await mkdir(join(tmpDir, ".github"), { recursive: true });
		await writeFile(
			join(tmpDir, ".github", "copilot-instructions.md"),
			[
				"# Review Instructions",
				"",
				"When reviewing code, always check for:",
				"- Missing null checks",
				"- Unused imports",
				"- Security: never expose API keys",
			].join("\n"),
		);

		// Create a sample file to review
		await mkdir(join(tmpDir, "src"), { recursive: true });
		await writeFile(
			join(tmpDir, "src", "example.ts"),
			[
				'const API_KEY = "sk-1234567890";',
				"",
				"export function getUser(id: string) {",
				"  const user = fetchUser(id);",
				"  return user.name;",
				"}",
			].join("\n"),
		);

		client = new CopilotClient({ cwd: tmpDir });
	});

	afterAll(async () => {
		if (client) {
			await client.stop().catch(() => {});
		}
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
		}
	});

	test("client connects and authenticates", async () => {
		await client.start();
		expect(client.getState()).toBe("connected");

		const auth = await client.getAuthStatus();
		expect(auth.isAuthenticated).toBe(true);
	});

	test("session discovers copilot-instructions.md via cwd", async () => {
		const findings: Finding[] = [];
		const emitFinding = createEmitFindingTool(findings);

		const session = await client.createSession({
			sessionId: `test-instructions-${Date.now()}`,
			model: "gpt-4.1",
			tools: [emitFinding],
			excludedTools: ["edit_file", "write_file", "shell", "git_push"],
			systemMessage: {
				content:
					"You are reviewing a single file. Call emit_finding for any issues. Be concise.",
			},
			onPermissionRequest: approveAll,
			workingDirectory: tmpDir,
		});

		try {
			const response = await session.sendAndWait(
				{
					prompt:
						"Review the file src/example.ts for issues. Focus on the hardcoded API key and the missing null check on fetchUser return value.",
					attachments: [
						{
							type: "file" as const,
							path: join(tmpDir, "src", "example.ts"),
						},
					],
				},
				60_000,
			);

			expect(response).toBeDefined();
			// The model should find at least 1 issue (hardcoded API key is obvious)
			expect(findings.length).toBeGreaterThanOrEqual(1);

			// Verify findings have correct structure
			for (const f of findings) {
				expect(f.filePath).toBeDefined();
				expect(f.fingerprint).toBeDefined();
				expect(f.fingerprint.length).toBeGreaterThan(0);
				expect(["critical", "warning", "suggestion", "nitpick"]).toContain(
					f.severity,
				);
			}

			console.log(`SDK integration: ${findings.length} findings from review`);
			for (const f of findings) {
				console.log(
					`  [${f.severity}] ${f.title} (${f.filePath}:${f.startLine})`,
				);
			}
		} finally {
			await session.disconnect();
		}
	}, 90_000);
});
