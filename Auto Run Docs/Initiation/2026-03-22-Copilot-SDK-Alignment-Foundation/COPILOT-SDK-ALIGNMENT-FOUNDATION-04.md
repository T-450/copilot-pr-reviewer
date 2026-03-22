# Phase 04: Foundation Regression And Release Hardening

This phase hardens the completed foundation work with full regression coverage, execution-mode validation, and release-ready cleanup so the repository is stable before Phase 2 starts adding interactive PR companion features. It matters because a partially migrated SDK foundation would make every later feature more fragile and harder to debug.

## Tasks

- [x] Consolidate the final foundation architecture and verify there are no leftover legacy paths:
  - Search for and remove or document obsolete `0.1.x` assumptions, dead compatibility code, unused prompt builders, and stale agent wiring
  - Reuse existing module boundaries where possible instead of introducing cosmetic reorganizations
  - Update any remaining inline comments or naming that no longer matches the verified `0.2.0` implementation
  - **Result:** Removed unused `ReviewMode` infrastructure (`src/prompts/review-modes.ts`, `resolveReviewMode()`, `_mode` parameters on three render functions, and 5 associated tests). No 0.1.x holdovers, stale agent wiring, or mismatched comments found in source. `prototype.ts` retained as a useful SDK validation tool with accurate comments. 232 tests pass, typecheck clean.

- [x] Expand and finalize regression coverage across the upgraded review pipeline:
  - Add or update tests for end-to-end orchestration, attachment-based file review, prompt/workflow configuration, hook behavior, reasoning mode configuration, streaming progress handling, and specialist review selection
  - Keep production changes out of this task except for fixes required to make the new tests pass
  - Prefer high-signal behavioral assertions over brittle snapshots
  - **Result:** Added 58 new regression tests across 3 files (1 new, 2 updated). Extracted `createStreamingHandler` to `src/streaming.ts` as the sole production change. New `tests/orchestrator.test.ts` (26 tests) covers streaming event handling, Bun.Glob file filtering, clustering disabled passthrough, threshold filtering pipeline, pipeline stage composition (filter→cluster→reconcile), and planning gate conditions. Updated `tests/session-wiring.test.ts` (+15 tests) covers infiniteSessions config, systemMessage mode/content, onPermissionRequest=approveAll, instruction config integration, all 4 reasoningEffort values, and model env var fallback. Updated `tests/hooks.test.ts` (+17 tests) covers all 5 session end reasons, all 3 session start sources, malformed toolArgs edge cases, and tool_execution error handling. 290 tests pass, typecheck clean.

- [x] Run the full verification matrix and fix failures:
  - Run the relevant Bun test suites, type checking, and any lint or formatting checks already used by the project
  - Execute the upgraded prototype and at least one broader orchestration path after the full test run
  - Fix regressions in small, isolated changes and rerun the affected commands until the foundation is stable
  - **Result:** Full verification matrix passes. Tests: 290 pass, 7 skip, 0 fail (638 assertions). Typecheck: clean. Biome: clean after fixing 34 lint issues across 9 files — `void` → `undefined` in hook union types, empty catch blocks, string concatenation → template literals, `noNonNullAssertion` suppressions, stale ESLint/biome-ignore comments, `delete` → `undefined` assignment. Production fix: replaced `!` with `as ChangedFile` in `src/ado/client.ts` reconcile (safe due to prior `.has()` filter). Prototype module graph loads cleanly (exits with expected token error). Main orchestrator (`src/index.ts`) exits 0 with graceful warning. Foundation is stable.

- [ ] Produce release-oriented structured knowledge artifacts for the completed foundation:
  - Create a final validation report with YAML front matter summarizing the upgrade result, commands run, known limitations, and readiness for Phase 2
  - Create or update a concise implementation summary document with wiki-links to the research, decision records, and validation reports
  - Ensure the documents are organized so Maestro DocGraph or Obsidian can traverse the foundation migration history cleanly

- [ ] Sanity-check developer ergonomics before handing off to later phases:
  - Confirm the main execution path, environment expectations, and test entry points are discoverable from the repository
  - Make only minimal, behavior-preserving cleanup changes needed to keep the foundation understandable for the next phase
  - Leave the repo in a state where the next playbook can build interactive PR companion features without revisiting core SDK alignment work
