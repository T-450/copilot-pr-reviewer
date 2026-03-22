# Phase 04: Hardening And Release Readiness

This phase hardens the conversational thread feature for maintainability, observability, and confident rollout after the core behavior is working. It matters because same-thread replies touch live PR collaboration, so the final step should leave the repository with strong regression coverage, clear operational signals, and documented limits before broader use.

## Tasks

- [ ] Audit the final implementation surface and remove fragile leftovers:
  - Search for and reuse existing cleanup patterns before introducing cosmetic refactors
  - Verify there are no dead prototype-only branches, duplicate prompt builders, orphaned thread helper types, or stale comments left behind by the earlier phases
  - Update only the minimum naming and inline comments needed to keep the conversational flow understandable for future work
  - Note (2026-03-22, cs): Reused the shared reply session prompt in `src/reply-prototype.ts`, pointed `src/reply-loop.ts` at the canonical `thread-context` type source, cleaned the stale Azure DevOps suggestion comment, removed orphaned `ReplyCandidateThread` fields (`botAuthorId`, `latestBotReplyAt`, `latestBotCheckpoint`), and dropped the prototype-only `extractAssistantText` re-export. `node_modules/.bin/tsc --noEmit` passes, but `bun` is still unavailable in this environment, so the Bun test run remains blocked and this item stays open for a later validation pass before it can be checked off.

- [ ] Expand regression coverage across the full thread-conversation path:
  - Add or update tests covering live orchestration sequencing, ADO reply posting, thread parsing, prompt rendering, duplicate suppression, graceful failure handling, and multi-turn conversation targeting
  - Reuse current `bun:test` structure and high-signal assertion style instead of adding brittle snapshots
  - Keep production fixes isolated to issues discovered by the new tests

- [ ] Improve runtime logging and operational visibility for conversational runs:
  - Add concise console output that shows how many reply candidates were scanned, how many replies were posted, and why comments were skipped when that reason is operationally useful
  - Reuse the current streaming and graceful-warning patterns instead of creating a parallel logging system
  - Ensure logs remain safe for CI output and do not leak full comment bodies or secrets

- [ ] Run the full verification matrix and fix remaining issues:
  - Run the relevant Bun test suites, the broader test command, typecheck, and the repo's existing formatting/lint command if the phase changes require it
  - Re-run the prototype or conversation harness after the full validation pass to verify the feature still demonstrates same-thread contextual replies end to end
  - Fix failures incrementally and rerun the affected commands until the conversational feature is stable

- [ ] Produce final structured release artifacts for the new feature:
  - Create a structured validation report under `docs/research/thread-conversations/` with YAML front matter summarizing commands run, final results, known limitations, and rollout readiness
  - Create or update one concise implementation summary note with wiki-links to the architecture note, decision record, and validation reports so Maestro DocGraph can traverse the feature history cleanly
  - Confirm the final notes make it easy for a later phase to add richer thread coverage or human-in-the-loop behaviors without re-discovering this work
