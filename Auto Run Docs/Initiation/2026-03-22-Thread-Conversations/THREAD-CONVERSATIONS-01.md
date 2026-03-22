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

- [ ] Add a reply-mode prompt and request builder that preserves thread context:
  - Reuse the current review prompt style and session configuration as the starting point for a follow-up assistant prompt
  - Build a focused prompt helper that includes the original finding summary, relevant file path/change context, and the ordered thread transcript needed to answer the user coherently
  - Keep the implementation attachment-first wherever file content is required, and avoid duplicating whole-file content into prompt text

- [ ] Deliver a runnable prototype that replies inside a simulated or controlled thread flow without any user input:
  - Extend `src/prototype.ts` or add a closely related executable prototype path that seeds a sample finding thread, injects one or more user follow-up comments, runs the reply flow, and prints the generated same-thread response
  - Make the output visibly useful by showing the detected trigger comment, the conversation context used, and the final reply text
  - Keep the prototype runnable through a Bun command so Phase 01 ends with a tangible working artifact

- [ ] Write focused tests for conversational thread parsing and reply request construction:
  - Add tests for identifying reply candidates, preserving thread order, excluding non-actionable comments, and building the reply prompt/request payload
  - Keep test creation separate from validation runs and reuse the repo's existing Bun test factories and mocking patterns before creating new ones
  - Add at least one regression test proving the prototype path stays non-interactive and produces a reply payload when a qualifying follow-up exists

- [ ] Run targeted validation and close the prototype phase with a structured result:
  - Run the relevant Bun test files, typecheck, and the prototype command; fix failures before closing the phase
  - Create a structured validation report with YAML front matter linking back to the design notes and recording commands run, results, and any explicitly deferred production gaps
  - Confirm the end state is a working prototype that demonstrates: user follow-up comment in a bot thread -> bot generates a context-aware same-thread reply
