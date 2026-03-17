import {
	CopilotClient,
	approveAll,
	type CustomAgentConfig,
} from "@github/copilot-sdk";
import { loadConfig, meetsThreshold } from "./config.ts";
import {
	fetchPRMetadata,
	fetchIterationDiff,
	listBotThreads,
	createThread,
	resolveThread,
	reconcile,
	collectFeedback,
} from "./ado/client.ts";
import {
	buildSystemPrompt,
	buildFilePrompt,
	buildPlanningPrompt,
	createEmitFindingTool,
} from "./review.ts";
import { createHooks } from "./hooks.ts";
import { configureBundledInstructionDirs } from "./instructions.ts";
import { clusterFindings } from "./cluster.ts";
import { CHANGE_TYPE_LABELS, type Finding } from "./types.ts";

const REVIEW_TIMEOUT = 120_000;
const PLANNING_TIMEOUT = 30_000;
const THREAD_ACTION_DELAY_MS = 500;

const securityAgentConfig: CustomAgentConfig = {
	name: "security-reviewer",
	description:
		"Specialized agent for security-focused code review of HIGH_RISK files",
	prompt: [
		"You are a security specialist. Review code for:",
		"- Authentication/authorization bypasses",
		"- Injection vulnerabilities (SQL, XSS, command injection)",
		"- Sensitive data exposure (secrets, PII, tokens)",
		"- Insecure cryptographic practices",
		"- SSRF, path traversal, and other OWASP Top 10 issues",
		"",
		"Use emit_finding for each issue. Set category to 'security' and severity to 'critical' or 'warning'.",
	].join("\n"),
	tools: ["emit_finding", "read_file", "list_files"],
};

const testAgentConfig: CustomAgentConfig = {
	name: "test-reviewer",
	description: "Specialized agent for reviewing test coverage and quality",
	prompt: [
		"You are a testing specialist. Review code for:",
		"- Missing test coverage for new/changed code",
		"- Untested edge cases and error paths",
		"- Flaky test patterns (timing, network, random)",
		"- Test-implementation coupling (testing internals vs behavior)",
		"",
		"Use emit_finding for each issue. Set category to 'testing'.",
	].join("\n"),
	tools: ["emit_finding", "read_file", "list_files"],
};

async function main(): Promise<void> {
	const configPath = process.env.CONFIG_PATH ?? ".prreviewer.yml";
	const config = await loadConfig(configPath);

	const ghToken = process.env.COPILOT_GITHUB_TOKEN;
	if (!ghToken) {
		console.warn(
			"##vso[task.logissue type=warning]COPILOT_GITHUB_TOKEN not set, skipping review",
		);
		process.exit(0);
	}

	const adoPat = process.env.ADO_PAT;
	if (!adoPat) {
		console.warn(
			"##vso[task.logissue type=warning]ADO_PAT not set, skipping review",
		);
		process.exit(0);
	}

	const [pr, iterationDiff, existingThreads] = await Promise.all([
		fetchPRMetadata(),
		fetchIterationDiff(),
		listBotThreads(),
	]);

	if (iterationDiff.files.length === 0) {
		console.log("No changed files in this iteration, skipping review");
		process.exit(0);
	}

	const filesToReview = iterationDiff.files
		.filter(
			(f) =>
				!config.ignore.some((pattern) => new Bun.Glob(pattern).match(f.path)),
		)
		.slice(0, config.maxFiles);

	if (filesToReview.length === 0) {
		console.log("All changed files are ignored by config, skipping review");
		process.exit(0);
	}

	console.log(
		`Reviewing ${filesToReview.length} files (iteration ${iterationDiff.currentIteration})`,
	);

	configureBundledInstructionDirs();

	const client = new CopilotClient({
		cwd: process.env.REPO_ROOT ?? process.cwd(),
	});

	const findings: Finding[] = [];
	const emitFinding = createEmitFindingTool(findings);

	const session = await client.createSession({
		sessionId: `review-${process.env.ADO_REPO_ID}-${process.env.ADO_PR_ID}-${iterationDiff.currentIteration}`,
		model: process.env.COPILOT_MODEL ?? "gpt-4.1",
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
		customAgents: [securityAgentConfig, testAgentConfig],
		hooks: createHooks(),
		systemMessage: {
			content: buildSystemPrompt(pr, config),
			mode: "append",
		},
		onPermissionRequest: approveAll,
		workingDirectory: process.env.REPO_ROOT ?? process.cwd(),
	});

	try {
		if (config.planning && filesToReview.length > 5) {
			console.log("Planning review strategy...");
			await session.sendAndWait(
				{ prompt: buildPlanningPrompt(pr, filesToReview) },
				PLANNING_TIMEOUT,
			);
		}

		const repoRoot = process.env.REPO_ROOT ?? process.cwd();
		for (const file of filesToReview) {
			const changeLabel = CHANGE_TYPE_LABELS[file.changeType] ?? "unknown";
			const absolutePath = `${repoRoot}/${file.path}`;
			const prompt = buildFilePrompt(file.path, changeLabel);

			console.log(`  Reviewing ${file.path} (${changeLabel})...`);
			await session.sendAndWait(
				{
					prompt,
					attachments: [{ type: "file", path: absolutePath }],
				},
				REVIEW_TIMEOUT,
			);
		}

		const reportableFindings = findings.filter((f) =>
			meetsThreshold(f.severity, config.severityThreshold),
		);
		console.log(
			`Found ${findings.length} findings, ${reportableFindings.length} meet threshold`,
		);

		const clusters = config.clustering
			? clusterFindings(reportableFindings, config.clusterThreshold)
			: reportableFindings.map((f) => ({
					primary: f,
					members: [f],
					clusterFingerprint: f.fingerprint,
					isClustered: false,
				}));

		const findingsToReconcile = clusters.flatMap((c) =>
			c.isClustered ? [c.primary] : c.members,
		);
		const {
			pendingThreads: threadsToCreate,
			threadsForReview: threadsToResolve,
		} = reconcile(existingThreads, findingsToReconcile, filesToReview);

		for (const createThreadTask of threadsToCreate) {
			await createThread(createThreadTask.finding, createThreadTask.file, {
				current: iterationDiff.currentIteration,
				previous: iterationDiff.previousIteration,
			});
			await Bun.sleep(THREAD_ACTION_DELAY_MS);
		}

		for (const threadId of threadsToResolve) {
			await resolveThread(threadId);
			await Bun.sleep(THREAD_ACTION_DELAY_MS);
		}

		const feedback = await collectFeedback(existingThreads, false);
		if (feedback.length > 0) {
			console.log(`Collected ${feedback.length} feedback signals`);
		}

		console.log(
			`Review complete: ${threadsToCreate.length} new comments, ${threadsToResolve.length} resolved`,
		);
	} finally {
		await session.disconnect();
		await client.stop();
	}
}

main().catch((err) => {
	console.error(
		`##vso[task.logissue type=warning]Review failed: ${err instanceof Error ? err.message : String(err)}`,
	);
	// fail gracefully to not block PRs
	process.exit(0);
});
