import { describe, expect, test } from "bun:test";
import { extractAssistantText } from "../src/reply-loop.ts";
import {
	formatReplyPrototypeReport,
	prepareReplyPrototype,
	runReplyPrototypeFlow,
} from "../src/reply-prototype.ts";

describe("prepareReplyPrototype", () => {
	test("builds an attachment-first reply request", () => {
		const prepared = prepareReplyPrototype("/repo/src/auth.ts");

		expect(prepared.thread.latestUserFollowUp?.id).toBe(30);
		expect(prepared.request.prompt).toContain("## Ordered Thread Transcript");
		expect(prepared.request.attachments).toHaveLength(1);
		const attachment = prepared.request.attachments?.[0];
		if (attachment?.type === "file") {
			expect(attachment.path).toBe("/repo/src/auth.ts");
		}
	});
});

describe("extractAssistantText", () => {
	test("pulls nested assistant text from object responses", () => {
		const text = extractAssistantText({
			message: {
				content: [
					{ ignored: true },
					"The follow-up is valid because the dereference still happens.",
				],
			},
		});

		expect(text).toContain("dereference still happens");
	});
});

describe("runReplyPrototypeFlow", () => {
	test("stays non-interactive and produces a reply payload", async () => {
		const calls: string[] = [];
		const result = await runReplyPrototypeFlow({
			absolutePath: "/repo/src/auth.ts",
			mode: "controlled",
			respond: async (request) => {
				calls.push(request.prompt);
				return {
					message: {
						content:
							"The helper only gates the branch; the dereference still needs its own null guard.",
					},
				};
			},
		});

		expect(calls).toHaveLength(1);
		expect(result.replyText).toContain("null guard");
		expect(result.report).toContain("Detected trigger comment:");
		expect(result.report).toContain("Generated same-thread reply:");
	});

	test("formats a readable prototype report", () => {
		const prepared = prepareReplyPrototype("/repo/src/auth.ts");
		const report = formatReplyPrototypeReport({
			...prepared,
			replyText: "Reply text goes here.",
			report: "",
			mode: "controlled",
		});

		expect(report).toContain("Conversation context used:");
		expect(report).toContain("Ada Reviewer");
		expect(report).toContain("Reply text goes here.");
	});
});
