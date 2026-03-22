---
type: architecture
title: Production Reply Loop Orchestration Order
created: 2026-03-22
tags:
  - thread-conversations
  - azure-devops
  - orchestration
  - architecture
related:
  - "[[Thread-Conversations-Hub]]"
  - "[[Existing-Review-Thread-Flow-Audit]]"
  - "[[ADO-Thread-Reply-API-Shape]]"
  - "[[Phase-01-Same-Thread-Reply-Prototype-Validation-Report]]"
---

# Production Reply Loop Orchestration Order

This note maps the production touchpoints for same-thread replies before the live pipeline is changed.

## Files And Reuse Points

| File | Current role | Reuse plan |
|------|--------------|------------|
| `src/index.ts` | Main PR review orchestrator | Add one narrow reply stage after normal thread updates and before final feedback logging |
| `src/session.ts` | Shared `buildSessionConfig()` wiring | Reuse the same session safety, instructions, tools, and lifecycle hooks for reply prompts |
| `src/hooks.ts` | Session guardrails and retry behavior | Keep reply execution inside the same hook model so error handling and tool restrictions stay aligned |
| `src/streaming.ts` | Console progress output | Reuse the same event handler so reply generation does not introduce a second streaming path |
| `tests/orchestrator.test.ts` | Orchestration sequencing coverage | Extend the existing pipeline-stage tests instead of inventing separate reply-only orchestration fixtures |
| `src/ado/client.ts` | ADO thread fetch, create, resolve, reconcile | Keep reply thread scanning and same-thread comment posting behind testable client helpers |

## Chosen Execution Order

The production reply pass should run after the normal review pipeline has already decided which finding threads to create or resolve.

1. Load config and environment guards.
2. Fetch PR metadata, iteration diff, and existing bot-thread data.
3. Filter changed files and create the shared Copilot session.
4. Run planning when enabled.
5. Review changed files.
6. Threshold, cluster, and reconcile findings against existing bot threads.
7. Create new finding threads.
8. Resolve stale finding threads.
9. Scan remaining bot-owned active threads for actionable human follow-ups and post same-thread replies.
10. Collect feedback signals and finish shutdown/logging.

## Why This Order

- Reply handling should stay out of planning because follow-up answers depend on settled thread state, not on review strategy selection.
- Reply handling should stay out of the per-file review loop because conversational replies target existing threads, not changed-file attachments discovered during the current run.
- Reply handling should run after reconcile plus create/resolve so the scan sees the freshest production thread state and avoids answering threads that this run already marked stale.
- Reply handling should run before the final feedback/logging block so the orchestrator can report conversational work in the same completion path without changing merge-blocking behavior.
- Session construction should stay shared through `buildSessionConfig()` so reply mode inherits the same tool deny-list, hook behavior, instruction loading, and model selection.

## Stage Boundaries

### Planning

No reply-specific branching belongs here. Planning remains about changed-file review breadth only.

### Per-File Review

This stage continues to emit findings only. It should not inspect thread transcripts or decide whether a human follow-up needs an answer.

### Reconcile And Thread Mutation

The reconcile stage remains the owner of new-finding deduplication and stale-thread resolution. Reply logic should consume the post-reconcile active-thread view rather than changing fingerprint semantics.

### Conversational Reply Pass

This stage should:

- read only bot-owned active threads,
- skip threads without a qualifying user follow-up,
- reuse the shared session and streaming lifecycle,
- keep ADO payload details inside `src/ado/client.ts`, and
- fail with warnings instead of aborting the PR review run.

## Non-Goals For Phase 02 Orchestration

- Replace the existing review pipeline with a reply-first or reply-only architecture.
- Create a second long-lived session architecture just for conversational replies.
- Change finding fingerprints, reconciliation rules, or feedback signal semantics.
- Answer non-bot threads, closed threads, or threads without a new actionable human follow-up.
- Introduce broader conversation memory beyond the existing ordered transcript plus latest actionable follow-up model from [[ADO-Thread-Reply-API-Shape]].

## Context Map

### Files To Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `docs/architecture/Production-Reply-Loop-Orchestration-Order.md` | Phase 02 architecture note | Capture execution order, touchpoints, and non-goals |
| `docs/research/thread-conversations/Thread-Conversations-Hub.md` | Thread-conversation index | Link the production orchestration note |
| `Auto Run Docs/Initiation/2026-03-22-Thread-Conversations/THREAD-CONVERSATIONS-02.md` | Maestro task tracker | Mark the mapping task complete and record note location |

### Dependencies

| File | Relationship |
|------|--------------|
| `src/index.ts` | Owns the pipeline stages that the note maps |
| `src/session.ts` | Defines the shared session wiring the future reply pass should reuse |
| `src/hooks.ts` | Provides the session-level guardrails the reply pass should inherit |
| `src/streaming.ts` | Provides the shared event output path for reply generation |
| `tests/orchestrator.test.ts` | Defines the sequencing test patterns Phase 02 should extend |

### Test Files

| Test | Coverage |
|------|----------|
| `tests/orchestrator.test.ts` | Current orchestration stage composition and sequencing patterns |

### Reference Patterns

| File | Pattern |
|------|---------|
| `docs/research/thread-conversations/Existing-Review-Thread-Flow-Audit.md` | Prior branch-point analysis from the prototype phase |
| `docs/research/thread-conversations/ADO-Thread-Reply-API-Shape.md` | Existing reply-candidate model and trigger rules |
| `docs/research/thread-conversations/Phase-01-Same-Thread-Reply-Prototype-Validation-Report.md` | Prototype evidence and explicit limits carried into production planning |
