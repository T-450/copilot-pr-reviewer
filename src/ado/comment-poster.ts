import type { AdoClient } from './client.js';
import type { Env, Finding, ChangedFile } from '../types.js';

const BOT_MARKER = '<!-- copilot-pr-reviewer-bot -->';
const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴',
  warning: '🟡',
  suggestion: '🔵',
  nitpick: '⚪',
};

export async function createThread(
  client: AdoClient,
  env: Env,
  finding: Finding,
  file: ChangedFile,
): Promise<number> {
  const content = [
    `${SEVERITY_ICONS[finding.severity]} **${finding.severity.toUpperCase()}** — ${finding.title}`,
    '',
    finding.message,
    finding.suggestion
      ? `\n**Suggested fix:**\n\n\`\`\`suggestion\n${finding.suggestion}\n\`\`\``
      : '',
    '',
    BOT_MARKER,
    `<!-- fingerprint:${finding.fingerprint} -->`,
  ].join('\n');

  const body = {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    threadContext: {
      filePath: `/${finding.filePath}`,
      rightFileStart: { line: finding.startLine, offset: 1 },
      rightFileEnd: { line: finding.endLine, offset: 1 },
    },
    pullRequestThreadContext: {
      changeTrackingId: file.changeTrackingId,
      iterationContext: {
        firstComparingIteration: file.previousIteration,
        secondComparingIteration: file.currentIteration,
      },
    },
    status: 1,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.request<any>(
    `/pullRequests/${env.adoPrId}/threads?api-version=7.1`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return result.id as number;
}

export async function resolveThread(
  client: AdoClient,
  env: Env,
  threadId: number,
): Promise<void> {
  await client.request(
    `/pullRequests/${env.adoPrId}/threads/${threadId}?api-version=7.1`,
    { method: 'PATCH', body: JSON.stringify({ status: 4 }) },
  );
}

export type ExistingBotThread = {
  id: number;
  filePath: string;
  fingerprint: string | null;
  changeTrackingId: number | null;
  status: number;
};

export async function listBotThreads(
  client: AdoClient,
  env: Env,
): Promise<ExistingBotThread[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.request<any>(
    `/pullRequests/${env.adoPrId}/threads?api-version=7.1`,
  );
  const threads: ExistingBotThread[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (result.value as any[]) ?? []) {
    const firstComment = (t.comments?.[0]?.content as string) ?? '';
    if (!firstComment.includes(BOT_MARKER)) continue;

    const fpMatch = firstComment.match(
      /<!-- fingerprint:(sha256:[a-f0-9]+) -->/,
    );
    threads.push({
      id: t.id as number,
      filePath:
        ((t.threadContext?.filePath as string) ?? '').replace(/^\//, ''),
      fingerprint: fpMatch?.[1] ?? null,
      changeTrackingId:
        (t.pullRequestThreadContext?.changeTrackingId as number) ?? null,
      status: t.status as number,
    });
  }
  return threads;
}
