# Phase 02: Prompt And Workflow Alignment

This phase turns the upgraded prototype into a maintainable foundation by separating prompt templates, aligning instruction and skill loading with verified SDK support, and removing ad hoc prompt construction where reusable workflow assets are a better fit. It matters because Phase 01 proves the migration works, but this phase makes the new architecture easier to extend without reintroducing prompt drift or duplicated review logic.

## Tasks

- [x] Map the current prompt and instruction composition before refactoring:
  - Search for and reuse existing prompt-building patterns in `src/review.ts`, `src/instructions.ts`, tests, templates, and any `.github` instruction assets
  - Document the current prompt sources, interpolation points, and execution order in structured markdown with YAML front matter
  - Capture which prompt sections belong in code, which belong in reusable templates, and which should become workflow or skill assets
  - Completed: Comprehensive map at `docs/research/copilot-sdk/Prompt-And-Instruction-Composition-Map.md` covering all 7 prompt sources, execution order diagram, interpolation points, classification of each source (stays as asset / template candidate / consolidation candidate), attachment vs prompt-injection audit, and config influence on prompts. All 136 tests pass.

- [x] Extract prompt templates into explicit, reusable review assets:
  - Refactor system, planning, and per-file prompt construction into clearly named template modules or assets without changing the current review contract
  - Preserve the existing finding schema, severity rules, and PR context details
  - Make the quick-pass review mode explicit in prompt selection while leaving room for deeper review modes later
  - Keep all new template paths easy to test and easy to reference from session setup
  - Completed: Created `src/prompts/` module with four files: `templates.ts` (named template constants + `renderSystemPrompt`, `renderFilePrompt`, `renderPlanningPrompt`), `agents.ts` (security-reviewer and test-reviewer sub-agent configs extracted from index.ts), `review-modes.ts` (`ReviewMode` union type with `resolveReviewMode()`), and `index.ts` barrel export. Refactored `src/review.ts` to delegate to template render functions via thin wrappers preserving the existing API. Refactored `src/index.ts` to import `reviewAgents` from the prompts module. All 136 tests pass, typecheck clean.

- [x] Align bundled instructions and skills/workflows with the verified SDK surface:
  - Reuse the existing bundled instruction directory logic before adding new loading behavior
  - Replace environment-only assumptions with code that explicitly configures the verified `skillDirectories` and related session options if they are needed for the review workflow
  - Add a structured decision note explaining which review behavior remains in prompt templates, which moves to SDK-managed skills or workflows, and why
  - Completed: Added `buildSessionInstructionConfig()` to `src/instructions.ts` returning explicit `skillDirectories: []` and `disabledSkills: []` — spread into `createSession()` in `src/index.ts`. Kept `configureBundledInstructionDirs()` for env-var instruction loading (only SDK mechanism). Decision note at `docs/decisions/Instruction-And-Skill-Alignment.md` covering all 10 review behaviors and their placement rationale. 5 new tests, all 141 pass, typecheck clean.

- [x] Implement attachment-first review inputs consistently across executable paths:
  - Search for any tests, fixtures, or helper flows that still inject whole file contents directly into prompts
  - Convert those paths to use whole-file native attachments where the SDK supports it, while preserving clear prompt context about change type and review expectations
  - Keep any remaining prompt-injected content only where it is strictly necessary, and document why in code comments or the decision note
  - Completed: Added `buildFileReviewRequest()` to `src/review.ts` returning `MessageOptions` with prompt + `type: "file"` attachment. Refactored `src/index.ts` and `src/prototype.ts` to use it. Fixed `tests/e2e-orchestrator.test.ts` which was the sole remaining path injecting file content directly into prompts (via `Bun.file().text()` + code fences). Added code comments in `src/prompts/templates.ts` documenting why metadata (paths, change types) stays prompt-injected while file content uses attachments. Updated decision note at `docs/decisions/Instruction-And-Skill-Alignment.md` with attachment-first policy. All 141 tests pass, typecheck clean.

- [ ] Write prompt and workflow tests separately from implementation changes:
  - Add or update tests for prompt template rendering, instruction directory configuration, and attachment-first request building
  - Assert stable behavior for existing review rules rather than snapshotting unnecessary incidental text
  - Add regression coverage for any workflow or skill-directory configuration introduced in this phase

- [ ] Run the relevant tests and verify the refactored review flow still behaves like the prototype:
  - Execute the focused prompt, instruction, and orchestration test suites
  - Fix template or configuration regressions before moving on
  - Update the structured validation notes with final prompt/workflow outcomes and wiki-links back to the research and prototype documents
