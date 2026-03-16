import type { AdoClient, AdoThread } from "./types";
import type { Finding, ChangedFile } from "../shared/types";

export const BOT_MARKER = "<!-- copilot-pr-reviewer-bot -->";

const SEVERITY_ICONS: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  suggestion: "🔵",
  nitpick: "⚪",
};

export function severityIcon(severity: string): string {
  return SEVERITY_ICONS[severity] ?? "⚪";
}

export function formatThreadContent(finding: Finding): string {
  const lines = [
    BOT_MARKER,
    `<!-- fingerprint:${finding.fingerprint} -->`,
    `### ${severityIcon(finding.severity)} ${finding.title}`,
    "",
    finding.message,
  ];
  if (finding.suggestion) {
    lines.push("", "**Suggestion:**", finding.suggestion);
  }
  lines.push("", `_Severity: ${finding.severity} | Category: ${finding.category} | Confidence: ${finding.confidence}_`);
  return lines.join("\n");
}

export async function createThread(
  client: AdoClient,
  prId: string,
  finding: Finding,
  file: ChangedFile,
): Promise<void> {
  const body = {
    comments: [{ parentCommentId: 0, content: formatThreadContent(finding), commentType: 1 }],
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
    status: 1, // active
  };
  await client.post(`/pullRequests/${prId}/threads`, body);
}

export async function listBotThreads(client: AdoClient, prId: string): Promise<AdoThread[]> {
  const response = await client.get<{ value: AdoThread[] }>(`/pullRequests/${prId}/threads`);
  return response.value.filter((thread) =>
    thread.comments.some((c) => c.content.includes(BOT_MARKER))
  );
}

export async function updateThreadStatus(
  client: AdoClient,
  prId: string,
  threadId: number,
  status: "fixed" | "closed",
): Promise<void> {
  const statusMap = { fixed: 4, closed: 5 };
  await client.patch(`/pullRequests/${prId}/threads/${threadId}`, { status: statusMap[status] });
}
