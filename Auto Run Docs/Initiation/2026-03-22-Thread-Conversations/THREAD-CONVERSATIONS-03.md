# Phase 03: Context Memory And Answer Quality

This phase strengthens the conversational feature so replies remain grounded across multiple turns instead of acting like isolated one-off answers. It matters because the acceptance criteria depend on relevant context retention, and users will quickly lose trust if the bot forgets the original finding, repeats itself, or answers the wrong comment in an active thread.

## Tasks

- [x] Define the per-thread conversation memory model and document the chosen approach:
  - Search for and reuse existing repo patterns for typed state, prompt inputs, and deterministic helper functions before introducing storage or serialization logic
  - Decide what context must be preserved per thread for reliable replies: original finding summary, file path, latest code context, comment chronology, and bot-reply checkpoints
  - Create a structured decision note under `docs/decisions/` with YAML front matter and wiki-links comparing transcript-only context vs persisted reply metadata and stating the chosen implementation
  - Completed in `docs/decisions/Thread-Conversation-Memory-Model.md`; chose transcript rehydration with persisted in-thread reply metadata checkpoints instead of adding external state.

- [x] Implement thread context assembly as a dedicated, testable layer:
  - Add helpers that transform raw Azure DevOps thread comments into a normalized conversation model suitable for prompt construction and duplicate detection
  - Preserve ordering, author roles, and reply boundaries so the assistant can answer the latest user follow-up with the full local context
  - Reuse existing domain types and avoid embedding Azure DevOps response shapes deep inside prompt logic
  - Completed in `src/thread-context.ts`, with `src/ado/client.ts` reusing the new normalization layer and focused coverage added in `tests/thread-context.test.ts`.

- [x] Improve reply generation quality with explicit conversational constraints:
  - Update prompt templates or helper renderers so follow-up replies reference the original issue, answer the latest question directly, and avoid restating the full finding unless it helps clarify the answer
  - Add clear rules for uncertainty, missing code context, and when the bot should acknowledge limits instead of bluffing
  - Keep prompt changes narrow and consistent with the current reviewer tone and severity-first style
  - Completed in `src/prompts/templates.ts` and `src/session.ts`; tightened the reply contract so answers lead with the newest unresolved question, stay anchored to the original finding, avoid unnecessary restatement, and explicitly acknowledge uncertainty when thread or file context is incomplete.

- [x] Add duplicate-response and stale-context protection:
  - Detect when the newest user comment has already been answered by the bot during an earlier run
  - Prevent replies that target outdated comments when a newer unresolved user follow-up exists in the same thread
  - Reuse thread metadata and comment ordering rather than inventing separate state files or external persistence for this phase unless clearly required by the decision note
  - Completed in `src/thread-context.ts`; latest follow-up selection now targets only the newest actionable user comment, suppresses duplicate replies when that newest comment already has an `in-reply-to` checkpoint, and still recovers when an older comment was answered after a newer unresolved follow-up was posted.

- [x] Write focused quality and memory tests:
  - Add tests for multi-turn transcript normalization, latest-comment targeting, duplicate-answer suppression, and prompt/context rendering across at least three-turn conversations
  - Reuse current prompt and ADO client test styles before creating new helpers
  - Keep these tests separate from validation runs and include edge cases such as missing bot marker content, edited comments, and mixed user/bot reply order
  - Completed in `tests/thread-context.test.ts`, `tests/review.test.ts`, and `tests/ado-client.test.ts`; added coverage for edited follow-ups, marker-only bot replies, multi-turn prompt rendering, and ADO thread normalization while keeping validation/reporting for the next task.

- [ ] Validate multi-turn context retention and record the outcome:
  - Run the relevant test suites and typecheck; fix issues in small, isolated changes before closing the phase
  - Exercise the prototype or a dedicated harness with multi-turn sample threads to confirm the bot answers follow-up questions with the right local context
  - Write a structured validation report with YAML front matter linking to the memory decision note and documenting what level of thread memory is now supported
