# Phase 01: Same-Thread Reply Prototype

This phase adds a fully autonomous prototype for conversational PR threads by teaching the bot to detect a user follow-up on one of its review comments, assemble the thread context, and generate a reply in the same Azure DevOps thread. It matters because it delivers the first visible end-to-end milestone for this feature: a runnable prototype that proves multi-turn thread conversations work before the production pipeline is changed.

## Tasks

- [x] Audit the existing review-thread flow and capture the minimum design needed for follow-up replies:
  - Search for and reuse existing patterns in `src/index.ts`, `src/ado/client.ts`, `src/review.ts`, `src/session.ts`, `src/prompts/`, `src/prototype.ts`, and `tests/` before introducing new abstractions
  - Identify the current bot-thread marker, fingerprint usage, thread listing shape, and where the main orchestration can branch into a reply mode
  - Create structured notes under `docs/research/thread-conversations/` with YAML front matter, wiki-links, and at least one hub note linking the design, API shape, and prototype plan

  Notes: captured the audit in `docs/research/thread-conversations/Existing-Review-Thread-Flow-Audit.md`, the minimum ADO payload in `docs/research/thread-conversations/ADO-Thread-Reply-API-Shape.md`, and the runnable prototype outline in `docs/research/thread-conversations/Same-Thread-Reply-Prototype-Plan.md`, all linked from `docs/research/thread-conversations/Thread-Conversations-Hub.md`.

- [x] Extend Azure DevOps thread retrieval and parsing for conversational prototypes:
  - Add types and helpers that can load full thread comment history, author metadata, timestamps, and parent-child relationships needed for reply handling
  - Detect bot-owned review threads and identify the latest actionable user follow-up comment after the bot's most recent reply
  - Reuse existing ADO fetch, retry, and auth patterns instead of creating parallel HTTP helpers

  Notes: extended `src/ado/client.ts` with normalized conversational thread types plus `listReplyCandidateThreads()`, kept `listBotThreads()` on the same fetch/auth path, and added targeted parsing coverage in `tests/ado-client.test.ts` for ordering, follow-up detection, and ignored comments. `npx tsc --noEmit` and `npx biome check src/ado/client.ts tests/ado-client.test.ts` passed; Bun test execution is still blocked in this environment because the `bun` binary is not installed.

- [x] Add a reply-mode prompt and request builder that preserves thread context:
  - Reuse the current review prompt style and session configuration as the starting point for a follow-up assistant prompt
  - Build a focused prompt helper that includes the original finding summary, relevant file path/change context, and the ordered thread transcript needed to answer the user coherently
  - Keep the implementation attachment-first wherever file content is required, and avoid duplicating whole-file content into prompt text

  Notes: added `renderReplyPrompt()` in `src/prompts/templates.ts` plus `buildReplyPrompt()`/`buildReplyRequest()` in `src/review.ts`, reusing the existing prompt-builder style while sanitizing the root finding summary and preserving the ordered thread transcript. Added focused coverage in `tests/review.test.ts` for reply prompt content, transcript ordering, and optional attachment-first request construction. `npx tsc --noEmit` and `npx biome check src/review.ts src/prompts/templates.ts src/prompts/index.ts tests/review.test.ts` passed; Bun test execution remains blocked in this environment because the `bun` binary is not installed.

- [x] Deliver a runnable prototype that replies inside a simulated or controlled thread flow without any user input:
  - Extend `src/prototype.ts` or add a closely related executable prototype path that seeds a sample finding thread, injects one or more user follow-up comments, runs the reply flow, and prints the generated same-thread response
  - Make the output visibly useful by showing the detected trigger comment, the conversation context used, and the final reply text
  - Keep the prototype runnable through a Bun command so Phase 01 ends with a tangible working artifact

  Notes: added `src/reply-prototype.ts` plus the `bun run prototype:reply` entry in `package.json`, using the existing reply-request builder to seed a realistic bot thread, show the trigger comment + transcript context, and print the generated same-thread reply. The command runs non-interactively in either `copilot-sdk` mode (when `COPILOT_GITHUB_TOKEN` is set) or a controlled offline mode for local/demo runs. Added `tests/reply-prototype.test.ts` to cover the attachment-first request, nested response text extraction, and a non-interactive prototype flow. Validation is still deferred in this environment because `bun`, `tsc`, and `biome` are not installed here.

- [x] Write focused tests for conversational thread parsing and reply request construction:
  - Add tests for identifying reply candidates, preserving thread order, excluding non-actionable comments, and building the reply prompt/request payload
  - Keep test creation separate from validation runs and reuse the repo's existing Bun test factories and mocking patterns before creating new ones
  - Add at least one regression test proving the prototype path stays non-interactive and produces a reply payload when a qualifying follow-up exists

  Notes: tightened `tests/ado-client.test.ts` with a regression that ignores human-only threads while keeping same-timestamp reply ordering deterministic, and extended `tests/review.test.ts` to assert reply requests remain attachment-first while stripping raw bot markers from the prompt payload. `npx tsc --noEmit` and `npx biome check tests/ado-client.test.ts tests/review.test.ts` passed; Bun test execution remains deferred to the validation task because the `bun` binary is not installed in this environment.

- [x] Run targeted validation and close the prototype phase with a structured result:
  - Run the relevant Bun test files, typecheck, and the prototype command; fix failures before closing the phase
  - Create a structured validation report with YAML front matter linking back to the design notes and recording commands run, results, and any explicitly deferred production gaps
  - Confirm the end state is a working prototype that demonstrates: user follow-up comment in a bot thread -> bot generates a context-aware same-thread reply

  Notes: updated `docs/research/thread-conversations/Phase-01-Same-Thread-Reply-Prototype-Validation-Report.md` and its hub link after completing Bun-native validation through `npm exec --yes bun -- ...` in this environment. Fixed a reply-thread regression in `src/ado/client.ts` by widening `FINGERPRINT_RE` so hyphenated fingerprints such as `fp-reply` and `reply-prototype-fp` are preserved. `npm exec --yes bun -- test tests/ado-client.test.ts tests/review.test.ts tests/reply-prototype.test.ts`, `npm exec --yes bun -- run typecheck`, `npx @biomejs/biome check src/reply-prototype.ts tests/ado-client.test.ts tests/review.test.ts tests/reply-prototype.test.ts src/ado/client.ts`, and `npm exec --yes bun -- run prototype:reply` all passed, confirming the working prototype path: user follow-up comment in a bot thread -> bot generates a context-aware same-thread reply.
