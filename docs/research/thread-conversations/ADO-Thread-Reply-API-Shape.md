---
type: research
title: ADO Thread Reply API Shape
created: 2026-03-22
tags:
  - thread-conversations
  - azure-devops
  - api-shape
  - parsing
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[Existing-Review-Thread-Flow-Audit]]"
  - "[[Same-Thread-Reply-Prototype-Plan]]"
---

# ADO Thread Reply API Shape

This note describes the minimum thread payload shape needed to detect and answer user follow-up comments in bot-owned review threads.

## Current Gap

`listBotThreads()` only keeps `content` from each comment, which is enough to find the bot marker but not enough to answer these reply questions:

- Who wrote each comment?
- Which comment is the root bot review comment?
- Which comments are direct replies versus nested replies?
- What is the latest user follow-up after the bot's most recent answer?
- In what exact order should the conversation transcript be rebuilt?

## Minimum Comment Shape Needed

The conversational prototype should normalize each Azure DevOps comment into a richer structure like this:

| Field | Needed for |
|-------|------------|
| `id` | stable ordering and parent-child linking |
| `parentCommentId` | reply-tree reconstruction |
| `content` | transcript and bot-marker parsing |
| `publishedDate` | latest actionable follow-up detection |
| `lastUpdatedDate` | optional tie-break or diagnostics |
| `isDeleted` | excluding dead comments |
| `author.id` | distinguishing bot from humans |
| `author.displayName` | readable prototype output |
| `author.isContainer` or similar service identity flag when available | optional bot heuristics |

## Minimum Thread Shape Needed

Each normalized bot-owned thread should carry:

| Field | Needed for |
|-------|------------|
| `threadId` | reply target |
| `filePath` | prompt context and logging |
| `status` | skip closed/non-actionable threads if desired |
| `fingerprint` | mapping back to the original finding summary |
| `comments[]` | ordered transcript and follow-up detection |
| `rootBotCommentId` | original finding anchor |
| `latestBotReplyAt` | cutoff for new user follow-ups |
| `latestUserFollowUp` | trigger comment for reply mode |

## Bot-Owned Thread Detection

The least risky prototype rule is:

1. A thread is bot-owned if any comment contains `<!-- copilot-pr-reviewer-bot -->`.
2. The bot comment that contains the marker is the root review finding comment unless later data proves otherwise.
3. The same comment body is also the place to parse `<!-- fingerprint:... -->`.

This rule matches the current production contract in `src/ado/client.ts` and avoids introducing new metadata.

## Latest Actionable Follow-Up Rule

The minimum viable rule for Phase 01 should be:

1. Sort non-deleted comments by published timestamp, then by comment id.
2. Identify comments authored by the bot.
3. Find the timestamp of the bot's most recent reply in the thread.
4. Find the newest human-authored comment posted after that timestamp.
5. Ignore empty comments, bot-authored comments, deleted comments, and comments that predate the latest bot reply.

This keeps the first prototype focused on a single obvious trigger comment instead of trying to solve every ambiguous thread shape.

## Suggested Normalized Output

The prototype-oriented parser should expose a shape close to this:

```ts
type ReplyCandidateThread = {
  threadId: number;
  filePath: string;
  fingerprint: string;
  status: number;
  comments: ThreadComment[];
  latestUserFollowUp: ThreadComment | null;
};
```

That output is small enough for tests, rich enough for prompt construction, and still fully derived from the existing Azure DevOps thread API.
