# Phase 03: Scoped Agent Migration

This phase replaces the current inline sub-agent setup with the nearest verified `0.2.0` SDK mechanism for scoped specialist review behavior, using the written research from earlier phases instead of assuming a nonexistent `defineAgent()` API. It matters because the foundation should converge on a supported agent model now, before later interactive and multi-agent features are built on top of an unsupported abstraction.

## Tasks

- [x] Convert the `defineAgent()` assumption into a concrete migration decision:
  - Reuse the Phase 01 research and inspect the upgraded SDK types and docs again before changing code
  - Create a structured markdown decision record with YAML front matter that compares:
    - staying on `customAgents` with cleaner configuration
    - using verified session agent-selection features
    - using extension-based agent specialization where that is the actual supported path
  - State the selected replacement strategy, its limits, and how it preserves today’s security-reviewer and test-reviewer behavior
  - **Decision:** Stay on `customAgents` — see `docs/decisions/Scoped-Agent-Migration-Strategy.md`

- [x] Refactor specialist review configuration to the chosen supported pattern:
  - Search for and reuse the current security and testing reviewer prompts, allowed-tool scopes, and orchestration logic before rewriting them
  - Move specialist agent definitions into a dedicated module or asset with clear ownership and minimal duplication
  - Ensure each specialist remains scoped to the smallest tool set needed for its job
  - Keep the default review session behavior stable unless the decision record explicitly requires a supported change
  - **Done:** Extracted shared `SPECIALIST_TOOLS` constant, added `displayName` and explicit `infer: true` to both agents, added `infer` behavior comments, updated tests (209 pass, typecheck clean)

- [x] Wire specialist selection and invocation into the main review flow:
  - Update session creation and any follow-on calls so the selected agent mechanism is explicit and testable
  - Preserve the current file-review loop, planning behavior, and findings collection semantics
  - Add code comments only where the supported SDK behavior is non-obvious and future maintainers would otherwise misread it
  - **Done:** Extracted `buildSessionConfig()` into `src/session.ts` as a pure, testable function. Session creation in `index.ts` now delegates to this function, making agent registration, tool scoping, and excluded-tool lists independently verifiable without a live SDK. Added inference-dispatch comments in both session.ts and the per-file review loop. All 209 tests pass, typecheck clean.

- [ ] Add focused tests for scoped specialist behavior:
  - Cover specialist registration, selection, allowed-tool scope, and fallback behavior when a specialist is unavailable
  - Keep these tests separate from the production refactor and reuse existing SDK integration patterns where possible
  - Add at least one regression test proving the main reviewer still works when specialist logic is disabled or bypassed

- [ ] Run specialist migration validation and update the knowledge artifacts:
  - Execute the targeted tests for agent configuration and orchestration
  - Fix any regressions in session startup, tool scoping, or findings flow before closing the phase
  - Update the structured research and decision notes with the final supported agent approach and links to the implementation and test coverage
