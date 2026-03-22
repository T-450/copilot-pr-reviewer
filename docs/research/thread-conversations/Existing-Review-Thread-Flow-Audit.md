---
type: analysis
title: Existing Review Thread Flow Audit
created: 2026-03-22
tags:
  - thread-conversations
  - azure-devops
  - review-flow
  - architecture
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[ADO-Thread-Reply-API-Shape]]"
  - "[[Same-Thread-Reply-Prototype-Plan]]"
---

# Existing Review Thread Flow Audit

This audit captures the minimum existing behavior that the conversational prototype should reuse instead of replacing.

## Files Reviewed

| File | Current role | Reuse value for replies |
|------|--------------|-------------------------|
| `src/index.ts` | Main orchestration for PR review | Best place to add a future reply-mode branch after startup and thread loading |
| `src/ado/client.ts` | Azure DevOps fetch, retry, auth, thread creation, reconciliation | Canonical place for richer thread retrieval and reply-candidate parsing |
| `src/review.ts` | Finding tool plus prompt/request helpers | Natural home for a reply request builder |
| `src/session.ts` | Shared session construction | Reply mode should reuse the same session safety and instruction wiring |
| `src/prompts/templates.ts` | Review and planning prompt renderers | Reply prompt should follow this template-driven style |
| `src/prototype.ts` | Runnable non-interactive SDK prototype | Best execution path for Phase 01 proof-of-concept |
| `tests/ado-client.test.ts` | ADO client factories and parsing coverage | Existing pattern for thread parsing and fetch mocks |
| `tests/review.test.ts` | Prompt/request builder tests | Existing pattern for prompt payload assertions |

## Current Thread Identity Markers

The current implementation already has the two identifiers the prototype should preserve:

- **Bot marker:** `src/ado/client.ts:24` defines `BOT_MARKER` as `<!-- copilot-pr-reviewer-bot -->`.
- **Fingerprint marker:** `src/ado/client.ts:25` defines `FINGERPRINT_RE` as `/<!-- fingerprint:(\w+) -->/`.

These markers are appended by `formatThreadBody()` in `src/ado/client.ts:220`, which means reply mode can recover the original finding identity from the thread body without inventing a second metadata channel.

## Current Bot Thread Listing Shape

`listBotThreads()` in `src/ado/client.ts:178` currently returns a compact `BotThread` shape:

| Field | Source | Limitation for replies |
|-------|--------|------------------------|
| `id` | thread id | sufficient |
| `filePath` | `threadContext.filePath` | sufficient |
| `fingerprint` | parsed from bot comment body | sufficient for mapping to the original finding |
| `status` | thread status | insufficient for follow-up detection on its own |

The fetch currently reads only `comments: Array<{ content: string }>` from Azure DevOps, so it drops the author, timestamps, comment ids, `parentCommentId`, and ordering metadata needed for conversational replies.

## Existing Review Orchestration

The current `src/index.ts` flow is:

1. Load config and environment guards.
2. Fetch PR metadata, iteration diff, and existing bot threads in parallel.
3. Filter changed files.
4. Build a review session with shared instructions and tools.
5. Optionally plan, then review files one-by-one.
6. Reconcile findings against existing bot threads.
7. Create new threads, resolve stale ones, collect feedback.

## Minimum Reply-Mode Branch Point

The cleanest future branch point is immediately after the initial bootstrap data has been loaded in `src/index.ts:47` and before the file-review loop begins.

Why this branch point is the smallest change:

- It reuses the same env validation, PR metadata fetch, auth, and SDK startup pattern.
- It avoids forcing reply mode through the diff-filtering and reconciliation pipeline, which is built for new findings rather than conversational follow-ups.
- It lets reply mode decide early whether a qualifying follow-up exists and exit cleanly if none exists.

## Reuse-First Design Constraints

- Keep Azure DevOps HTTP access inside `src/ado/client.ts` so reply mode inherits the existing PAT auth and `adoFetch()` retry behavior.
- Keep reply request construction near `buildFileReviewRequest()` in `src/review.ts` so prompt creation stays attachment-first and testable.
- Keep session creation centralized through `buildSessionConfig()` in `src/session.ts` unless the prototype has a strong reason to stay isolated inside `src/prototype.ts`.
- Keep the first runnable proof inside `src/prototype.ts` or a sibling prototype entry point so production review behavior stays unchanged during Phase 01.
