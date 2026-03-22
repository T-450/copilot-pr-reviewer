# Phase 01: Verified SDK Upgrade Prototype

This phase upgrades the project to `@github/copilot-sdk` `0.2.0`, verifies the real SDK surface in structured research notes, and ships a behavior-preserving working prototype of the review pipeline using the newer tool, hook, attachment, reasoning, and streaming capabilities. It matters because the rest of the foundation work should build on a running, validated baseline instead of assumptions about the SDK API.

## Tasks

- [x] Audit the current implementation and create structured SDK verification notes before changing code:
  - Search for and reuse existing patterns in `src/`, `tests/`, `README.md`, and the installed SDK package before inventing new abstractions
  - Inspect current usage of `customAgents`, tool definitions, hooks, attachments, session creation, and review orchestration
  - Create `docs/research/copilot-sdk/` markdown notes with YAML front matter and wiki-links covering:
    - installed `0.1.32` surface used by this repo
    - verified `0.2.0` capabilities relevant to this migration
    - the absence of a published `defineAgent` export and the verified nearest replacement options
  - Create a concise summary document linking the detailed notes with `[[Copilot-SDK-Upgrade-Summary]]`
  - Notes created:
    - `docs/research/copilot-sdk/Copilot-SDK-0.1.32-Current-Surface.md`
    - `docs/research/copilot-sdk/Copilot-SDK-0.2.0-Verified-Capabilities.md`
    - `docs/research/copilot-sdk/Copilot-SDK-DefineAgent-Verification.md`
    - `docs/research/copilot-sdk/Copilot-SDK-Upgrade-Summary.md`

- [x] Upgrade the SDK baseline while preserving current behavior:
  - Update `@github/copilot-sdk` to `0.2.0` and refresh the lockfile using the project’s existing package workflow
  - Review any TypeScript surface changes in the installed package before editing application code
  - Record migration constraints, non-goals, and compatibility decisions in a structured markdown decision note with YAML front matter and wiki-links to the research docs
  - Completed: SDK upgraded to 0.2.0, typecheck and all 83 tests pass with zero code changes, decision note at `docs/research/copilot-sdk/Copilot-SDK-0.2.0-Migration-Decisions.md`

- [x] Refactor the review session foundation to verified `0.2.0` APIs and keep the current review flow intact:
  - Replace the manual `emit_finding` tool definition with `defineTool()` and the existing Zod schema from `src/review.ts`
  - Keep whole-file native attachments as the default review input path and remove prompt-injected file content where it is still being used in executable review paths
  - Add `reasoningEffort` support for a quick-pass default that matches current behavior as closely as possible, with an easy path for deeper review later
  - Add `onPreToolUse` and `onUserPromptSubmitted` hooks in a behavior-preserving way and keep the existing lifecycle hooks working
  - Add streaming event handling or logging so a user can see real-time review progress during execution
  - Completed: `defineTool()` migrated with `skipPermission: true`, `reasoningEffort` config field (default `"low"`), `onPreToolUse` denies destructive tools, `onUserPromptSubmitted` guards empty prompts, streaming via `onEvent` handler shows dots/errors. 89 tests pass, typecheck clean.

- [ ] Deliver a runnable prototype that proves the upgraded foundation works end to end without user input:
  - Reuse existing E2E and SDK integration patterns before creating new fixtures or harnesses
  - Add or update one executable prototype path that starts the upgraded client, performs planning when appropriate, reviews attached files, and records findings
  - Ensure the prototype runs non-interactively through an existing Bun command or a narrowly scoped new command
  - Make the output visibly useful: show per-file review progress, streaming updates, and a final findings summary

- [ ] Write focused tests for the upgraded tool and session wiring:
  - Cover the `defineTool()` migration, attachment-based review requests, reasoning mode selection, and the newly wired hooks
  - Keep test additions separate from production changes and follow the repo’s existing Bun test style
  - Add assertions that preserve current orchestration behavior rather than broad rewrites of expected outcomes

- [ ] Run validation and capture the working-prototype result:
  - Run targeted tests first, then the broader relevant Bun test suites, and fix any regressions introduced by the upgrade
  - Execute the prototype command or integration path to confirm the upgraded flow works from session creation through findings collection
  - Write a structured validation report with YAML front matter summarizing commands run, results, remaining gaps, and links to the research and decision notes
