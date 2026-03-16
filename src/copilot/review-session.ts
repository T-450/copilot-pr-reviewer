import { CopilotClient, defineTool, approveAll } from "@github/copilot-sdk";
import type { ChangedFile, Finding, PrMetadata, ReviewConfig } from "../shared/types";
import { FindingSchema } from "./tool-contract";
import { createPermissionHook } from "./permission-policy";
import { buildSystemMessage } from "../core/prompt-builder";
import { generateFingerprint } from "../core/finding-fingerprint";

export async function reviewFiles(
  files: ChangedFile[],
  prMeta: PrMetadata,
  config: ReviewConfig,
  repoMap: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();

  const client = new CopilotClient({
    cwd: repoRoot,
    githubToken: process.env.COPILOT_GITHUB_TOKEN,
  });

  const session = await client.createSession({
    model: process.env.COPILOT_MODEL ?? "gpt-4.1",
    systemMessage: {
      content: buildSystemMessage(prMeta, config, repoMap),
      mode: "append",
    },
    onPermissionRequest: approveAll,
    tools: [
      defineTool("emit_finding", {
        description: "Report a code review finding",
        parameters: FindingSchema,
        handler: async (params: unknown) => {
          const parsed = FindingSchema.safeParse(params);
          if (parsed.success) {
            const fingerprint = generateFingerprint(parsed.data);
            findings.push({ ...parsed.data, fingerprint });
            return "Finding recorded.";
          }
          return `Invalid finding: ${JSON.stringify(parsed.error.issues)}`;
        },
      }),
    ],
    hooks: {
      onPreToolUse: createPermissionHook(),
    },
  });

  try {
    for (const file of files) {
      const prompt = [
        `## File: ${file.path}`,
        `Risk: ${file.riskLevel} | Tests: ${file.testStatus} | Change: ${file.changeType}`,
        "",
        "```diff",
        file.diff,
        "```",
      ].join("\n");
      await session.sendAndWait({
        prompt,
        attachments: [{ type: "file", path: file.absolutePath, displayName: file.path }],
      });
    }
  } finally {
    await session.disconnect();
    await client.stop();
  }

  return findings;
}
