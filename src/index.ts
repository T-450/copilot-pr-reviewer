import {
	CopilotClient,
	approveAll,
	type SessionEvent,
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
	buildPlanningPrompt,
	buildFileReviewRequest,
	createEmitFindingTool,
} from "./review.ts";
import { createHooks } from "./hooks.ts";
import {
	configureBundledInstructionDirs,
	buildSessionInstructionConfig,
} from "./instructions.ts";
import { clusterFindings } from "./cluster.ts";
import { CHANGE_TYPE_LABELS, type Finding } from "./types.ts";
import { reviewAgents } from "./prompts/index.ts";

const REVIEW_TIMEOUT = 120_000;
const PLANNING_TIMEOUT = 30_000;
const THREAD_ACTION_DELAY_MS = 500;

function createStreamingHandler(): (event: SessionEvent) => void {
	return (event) => {
		switch (event.type) {
			case "assistant.message_delta":
				process.stdout.write(".");
				break;
			case "assistant.message":
				process.stdout.write("\n");
				break;
			case "session.error":
				console.error(
					`  [stream error] ${(event as { data: { message: string } }).data.message}`,
				);
				break;
			case "session.idle":
				break;
		}
	};
}

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
	const instructionConfig = buildSessionInstructionConfig();

	const client = new CopilotClient({
		cwd: process.env.REPO_ROOT ?? process.cwd(),
	});

	const findings: Finding[] = [];
	const emitFinding = createEmitFindingTool(findings);

	const session = await client.createSession({
		sessionId: `review-${process.env.ADO_REPO_ID}-${process.env.ADO_PR_ID}-${iterationDiff.currentIteration}`,
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
		customAgents: [...reviewAgents],
		hooks: createHooks(),
		systemMessage: {
			content: buildSystemPrompt(pr, config),
			mode: "append",
		},
		...instructionConfig,
		onPermissionRequest: approveAll,
		onEvent: createStreamingHandler(),
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
			console.log(`  Reviewing ${file.path} (${changeLabel})...`);
			await session.sendAndWait(
				buildFileReviewRequest(
					file.path,
					changeLabel,
					`${repoRoot}/${file.path}`,
				),
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
