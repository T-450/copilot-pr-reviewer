import { CopilotClient } from "@github/copilot-sdk";
import { loadConfig, meetsThreshold } from "./config.ts";
import {
	fetchPRMetadata,
	fetchIterationDiff,
	listBotThreads,
	listReplyCandidateThreads,
	createThread,
	createThreadReply,
	resolveThread,
	reconcile,
	collectFeedback,
} from "./ado/client.ts";
import {
	buildPlanningPrompt,
	buildFileReviewRequest,
	createEmitFindingTool,
} from "./review.ts";
import { configureBundledInstructionDirs } from "./instructions.ts";
import { clusterFindings } from "./cluster.ts";
import { CHANGE_TYPE_LABELS, type Finding } from "./types.ts";
import { buildReplySessionConfig, buildSessionConfig } from "./session.ts";
import { createStreamingHandler } from "./streaming.ts";
import { runReplyLoop } from "./reply-loop.ts";
import { runPostReviewActions } from "./review-orchestrator.ts";

const REVIEW_TIMEOUT = 120_000;
const PLANNING_TIMEOUT = 30_000;
const THREAD_ACTION_DELAY_MS = 500;

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

	const repoRoot = process.env.REPO_ROOT ?? process.cwd();
	const changeContextByFilePath = new Map(
		filesToReview.map((file) => [
			file.path,
			CHANGE_TYPE_LABELS[file.changeType] ?? "unknown",
		]),
	);

	const client = new CopilotClient({ cwd: repoRoot });

	const findings: Finding[] = [];
	const emitFinding = createEmitFindingTool(findings);

	const sessionConfig = buildSessionConfig({
		repoId: process.env.ADO_REPO_ID ?? "",
		prId: process.env.ADO_PR_ID ?? "",
		iteration: iterationDiff.currentIteration,
		pr,
		config,
		tools: [emitFinding],
		repoRoot,
	});

	const session = await client.createSession({
		...sessionConfig,
		onEvent: createStreamingHandler(),
	});

	try {
		if (config.planning && filesToReview.length > 5) {
			console.log("Planning review strategy...");
			await session.sendAndWait(
				{ prompt: buildPlanningPrompt(pr, filesToReview) },
				PLANNING_TIMEOUT,
			);
		}

		// Per-file review loop.  Each sendAndWait call sends a prompt + file
		// attachment.  The SDK's agent inference may dispatch to a specialist
		// (security-reviewer, test-reviewer) based on the file content and the
		// agents' descriptions.  Files that don't trigger a specialist are
		// reviewed by the main session agent.
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

		const { replyResult, feedback } = await runPostReviewActions({
			threadsToCreate,
			threadsToResolve,
			existingThreads,
			createThread,
			resolveThread,
			runReplyLoop: () =>
				runReplyLoop({
					repoRoot,
					listThreads: listReplyCandidateThreads,
					createSession: () =>
						client.createSession({
							...buildReplySessionConfig({
								repoId: process.env.ADO_REPO_ID ?? "",
								prId: process.env.ADO_PR_ID ?? "",
								iteration: iterationDiff.currentIteration,
								pr,
								config,
								repoRoot,
							}),
							onEvent: createStreamingHandler(),
						}),
					postReply: createThreadReply,
					sleep: Bun.sleep,
					threadActionDelayMs: THREAD_ACTION_DELAY_MS,
					warn: console.warn,
					log: console.log,
					changeContextByFilePath,
				}),
			collectFeedback,
			sleep: Bun.sleep,
			threadActionDelayMs: THREAD_ACTION_DELAY_MS,
			iteration: {
				current: iterationDiff.currentIteration,
				previous: iterationDiff.previousIteration,
			},
		});

		if (feedback.length > 0) {
			console.log(`Collected ${feedback.length} feedback signals`);
		}

		const replyStats =
			replyResult.scannedThreads > 0
				? `${replyResult.repliesPosted}/${replyResult.actionableThreads} follow-up replies (${replyResult.scannedThreads} scanned)`
				: `${replyResult.repliesPosted} follow-up replies`;
		console.log(
			`Review complete: ${threadsToCreate.length} new comments, ${threadsToResolve.length} resolved, ${replyStats}`,
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
