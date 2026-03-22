# Phase 02: Production Reply Loop

This phase turns the prototype into real pipeline behavior by wiring follow-up detection, conversational session execution, and same-thread posting into the main PR review run. It matters because the feature only becomes user-visible in Azure DevOps once the orchestrator can notice thread replies and answer them safely in the live review flow.

## Tasks

- [x] Map the production orchestration touchpoints before changing the live flow:
  - Search for and reuse existing orchestration patterns in `src/index.ts`, `src/session.ts`, `src/hooks.ts`, `src/streaming.ts`, and `tests/orchestrator.test.ts` before adding new branches
  - Identify where thread reply handling should run relative to planning, per-file review, reconcile, thread creation, resolution, and feedback collection
  - Create or update a structured implementation note under `docs/architecture/` with YAML front matter and wiki-links describing the chosen execution order and non-goals

  Notes: documented the Phase 02 execution order in `docs/architecture/Production-Reply-Loop-Orchestration-Order.md`, linked it from `docs/research/thread-conversations/Thread-Conversations-Hub.md`, and chose a reply pass that runs after reconcile + thread mutation but before final feedback/logging so live replies see the freshest active-thread state without changing finding semantics.

- [ ] Add production-grade ADO helpers for posting bot replies into existing threads:
  - Reuse the existing ADO auth, retry, and request-body style from `createThread` and `resolveThread`
  - Implement helpers for creating a reply comment on an existing thread, carrying forward bot markers or metadata needed for later detection without breaking current finding reconciliation
  - Keep the thread-update API surface narrow and testable so orchestration logic does not know Azure DevOps payload details

- [ ] Integrate follow-up reply handling into the main review pipeline:
  - Add a dedicated branch in `src/index.ts` that scans bot-owned active threads for actionable user follow-ups and runs a conversational reply pass before shutdown
  - Reuse `buildSessionConfig()` and existing session lifecycle patterns wherever possible instead of creating a second session architecture unless a narrow helper is clearly cleaner
  - Ensure the live flow skips non-bot threads, already-answered comments, and threads that do not contain a qualifying user follow-up

- [ ] Add reply body formatting and operational guardrails:
  - Format reply comments consistently with the repository's current thread voice and metadata style while distinguishing conversational replies from initial findings
  - Add minimal safeguards for empty replies, duplicate reply attempts during the same run, and comment storms caused by stale thread scans
  - Preserve graceful failure behavior so reply errors log warnings without blocking PR completion

- [ ] Write focused production integration tests for same-thread replies:
  - Add tests covering thread scan ordering, actionable follow-up detection, reply posting requests, duplicate-suppression logic, and orchestrator sequencing
  - Reuse current ADO client test factories and orchestration test patterns before adding new fixtures
  - Keep live-flow tests separate from validation runs and include at least one regression asserting that normal review comment creation still works when no follow-up replies exist

- [ ] Run the production reply validation matrix and capture the result:
  - Run the relevant unit tests, orchestration tests, and typecheck; fix any regressions introduced by the live reply path
  - Execute the prototype or an equivalent non-live harness after the production integration changes to confirm prototype behavior still holds
  - Write a structured validation report with YAML front matter summarizing reply-loop readiness, known limits, and links to the architecture note and Phase 01 prototype artifacts
