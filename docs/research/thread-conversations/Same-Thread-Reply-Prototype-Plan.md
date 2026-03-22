---
type: report
title: Same-Thread Reply Prototype Plan
created: 2026-03-22
tags:
  - thread-conversations
  - prototype
  - copilot-sdk
  - planning
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[Existing-Review-Thread-Flow-Audit]]"
  - "[[ADO-Thread-Reply-API-Shape]]"
---

# Same-Thread Reply Prototype Plan

This plan captures the smallest implementation that can prove same-thread conversational replies work without changing the production pipeline.

## Prototype Path

The best Phase 01 prototype path is to extend `src/prototype.ts` or add a sibling prototype entry point that reuses its non-interactive execution style.

## Minimum Implementation Slices

### 1. Thread Parsing

- Extend `src/ado/client.ts` with richer thread/comment types.
- Add helpers that normalize ordered comments and derive `latestUserFollowUp`.
- Reuse the current `adoFetch()` auth and retry path instead of introducing new fetch code.

### 2. Reply Prompt Construction

- Add a prompt renderer in `src/prompts/templates.ts` for follow-up replies.
- Add a request builder in `src/review.ts` that mirrors `buildFileReviewRequest()`.
- Include finding summary, file path, and ordered thread transcript in prompt metadata.
- Attach file content only when needed, keeping the request attachment-first.

### 3. Runnable Prototype

- Seed a sample finding thread with one root bot comment, one or more user follow-ups, and optionally a prior bot reply.
- Run reply-candidate detection automatically.
- Print three artifacts: trigger comment, transcript used, and generated reply text.

## Expected Branching Strategy

The long-term production integration can branch from `src/index.ts` after startup data is loaded, but the prototype should stay isolated from the live review path until the parsing and prompt shape are validated.

## Test Targets For The Next Task

- `tests/ado-client.test.ts` for reply-candidate parsing and ordering.
- `tests/review.test.ts` for reply prompt/request payload construction.
- A prototype-focused test file for the non-interactive reply flow.

## Explicit Production Gaps Left Open

- No live Azure DevOps reply posting yet.
- No automatic production-mode selection between review and reply flows yet.
- No persistence layer for conversation memory beyond the current thread transcript.
