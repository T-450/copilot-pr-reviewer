import {
  CopilotClient,
  defineTool,
  approveAll,
  type ZodSchema,
} from '@github/copilot-sdk';
import { FindingSchema } from './tool-contract.js';
import type { z } from 'zod';
import {
  buildSystemMessage,
  buildReviewPrompt,
} from '../repo/context-builder.js';
import {
  fingerprint,
  type ChangedFile,
  type Finding,
  type PRMetadata,
  type ReviewConfig,
} from '../types.js';

type FindingInput = z.infer<typeof FindingSchema>;

export async function reviewFiles(
  files: ChangedFile[],
  prMeta: PRMetadata,
  _config: ReviewConfig,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  const emitFinding = defineTool<FindingInput>('emit_finding', {
    description:
      'Report a code review finding at a specific file and line range.',
    parameters: FindingSchema as unknown as ZodSchema<FindingInput>,
    handler: async (args) => {
      const validated = FindingSchema.parse(args);
      findings.push({
        ...validated,
        fingerprint: fingerprint(
          validated.filePath,
          validated.startLine,
          validated.title,
        ),
      });
      return { ok: true };
    },
  });

  const repoRoot = process.env.REPO_ROOT!;
  const systemMessage = await buildSystemMessage(prMeta, files, repoRoot);
  const reviewPrompt = buildReviewPrompt(files);

  const client = new CopilotClient({ cwd: repoRoot });

  const session = await client.createSession({
    model: process.env.COPILOT_MODEL ?? 'gpt-4.1',
    tools: [emitFinding],
    systemMessage: { mode: 'append', content: systemMessage },
    onPermissionRequest: approveAll,
  });

  try {
    await session.sendAndWait({
      prompt: reviewPrompt,
      attachments: files.map((f) => ({
        type: 'file' as const,
        path: f.absolutePath,
        displayName: f.path,
      })),
    });
  } finally {
    await session.disconnect();
    await client.stop();
  }

  return findings;
}
