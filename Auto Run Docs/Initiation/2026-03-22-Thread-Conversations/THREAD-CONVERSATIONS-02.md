# Phase 02: Production Reply Loop

This phase turns the prototype into real pipeline behavior by wiring follow-up detection, conversational session execution, and same-thread posting into the main PR review run. It matters because the feature only becomes user-visible in Azure DevOps once the orchestrator can notice thread replies and answer them safely in the live review flow.

## Tasks

- [x] Map the production orchestration touchpoints before changing the live flow:
  - Search for and reuse existing orchestration patterns in `src/index.ts`, `src/session.ts`, `src/hooks.ts`, `src/streaming.ts`, and `tests/orchestrator.test.ts` before adding new branches
  - Identify where thread reply handling should run relative to planning, per-file review, reconcile, thread creation, resolution, and feedback collection
  - Create or update a structured implementation note under `docs/architecture/` with YAML front matter and wiki-links describing the chosen execution order and non-goals

  Notes: documented the Phase 02 execution order in `docs/architecture/Production-Reply-Loop-Orchestration-Order.md`, linked it from `docs/research/thread-conversations/Thread-Conversations-Hub.md`, and chose a reply pass that runs after reconcile + thread mutation but before final feedback/logging so live replies see the freshest active-thread state without changing finding semantics.

- [x] Add production-grade ADO helpers for posting bot replies into existing threads:
  - Reuse the existing ADO auth, retry, and request-body style from `createThread` and `resolveThread`
  - Implement helpers for creating a reply comment on an existing thread, carrying forward bot markers or metadata needed for later detection without breaking current finding reconciliation
  - Keep the thread-update API surface narrow and testable so orchestration logic does not know Azure DevOps payload details

  Notes: added `createThreadReply()` in `src/ado/client.ts` as the narrow POST helper for `/threads/{threadId}/comments`, reused the shared `adoFetch()` auth/retry path, and formatted reply bodies with a dedicated reply marker plus optional `in-reply-to` metadata so future follow-up detection can distinguish conversational bot replies without confusing root finding fingerprints.

- [x] Integrate follow-up reply handling into the main review pipeline:
  - Add a dedicated branch in `src/index.ts` that scans bot-owned active threads for actionable user follow-ups and runs a conversational reply pass before shutdown
  - Reuse `buildSessionConfig()` and existing session lifecycle patterns wherever possible instead of creating a second session architecture unless a narrow helper is clearly cleaner
  - Ensure the live flow skips non-bot threads, already-answered comments, and threads that do not contain a qualifying user follow-up

  Notes: added `runReplyLoop()` in `src/reply-loop.ts` and wired it into `src/index.ts` after create/resolve but before feedback collection; the live pass now refreshes bot-owned threads, filters to active threads with a new actionable human follow-up, reuses shared session wiring through `buildReplySessionConfig()`, and posts same-thread replies via the existing ADO helper surface without changing finding reconciliation.

- [x] Add reply body formatting and operational guardrails:
  - Format reply comments consistently with the repository's current thread voice and metadata style while distinguishing conversational replies from initial findings
  - Add minimal safeguards for empty replies, duplicate reply attempts during the same run, and comment storms caused by stale thread scans
  - Preserve graceful failure behavior so reply errors log warnings without blocking PR completion

  Notes: updated `src/ado/client.ts` to sanitize reply text, add a reply-specific footer plus `in-reply-to` metadata, and reject bodies that collapse to metadata-only content; updated `src/reply-loop.ts` to dedupe same-run follow-up attempts and cap reply volume per run to avoid stale-scan storms while keeping warning-only failure behavior intact.

- [x] Write focused production integration tests for same-thread replies:
  - Add tests covering thread scan ordering, actionable follow-up detection, reply posting requests, duplicate-suppression logic, and orchestrator sequencing
  - Reuse current ADO client test factories and orchestration test patterns before adding new fixtures
  - Keep live-flow tests separate from validation runs and include at least one regression asserting that normal review comment creation still works when no follow-up replies exist

  Notes: kept the existing `tests/ado-client.test.ts` and `tests/reply-loop.test.ts` coverage for thread scanning, actionable follow-up detection, reply POST payloads, and duplicate suppression, then added `tests/review-orchestrator.test.ts` plus the new `src/review-orchestrator.ts` helper to assert production sequencing (create -> resolve -> reply -> feedback) and a regression where normal review comments still post when the reply pass finds no actionable follow-ups; verified the new wiring with `npm exec tsc -- --noEmit` and `npm exec @biomejs/biome check ...` in this environment because the Bun binary is not installed here.

- [x] Run the production reply validation matrix and capture the result:
  - Run the relevant unit tests, orchestration tests, and typecheck; fix any regressions introduced by the live reply path
  - Execute the prototype or an equivalent non-live harness after the production integration changes to confirm prototype behavior still holds
  - Write a structured validation report with YAML front matter summarizing reply-loop readiness, known limits, and links to the architecture note and Phase 01 prototype artifacts

  Notes: ran `npm exec --yes bun -- test` (317 pass, 7 skip, 0 fail across 324 tests), `npm exec --yes bun -- run typecheck`, and `npm exec --yes bun -- run prototype:reply`; captured the Phase 02 readiness result in `docs/research/thread-conversations/Phase-02-Production-Reply-Loop-Validation-Report.md` and linked it from `docs/research/thread-conversations/Thread-Conversations-Hub.md`, with the known limit that live SDK reply generation still requires `COPILOT_GITHUB_TOKEN`.
