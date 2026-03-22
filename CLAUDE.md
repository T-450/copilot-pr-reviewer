# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An automated PR code reviewer for Azure DevOps, powered by GitHub Copilot SDK (`@github/copilot-sdk`). It runs as an Azure DevOps pipeline task that reviews changed files in a PR iteration, posts findings as threaded comments, and auto-resolves stale comments when issues are fixed.

## Commands

```bash
bun install                  # install dependencies
bun run start                # run the reviewer (requires env vars)
bun test                     # run all tests
bun test tests/config.test.ts  # run a single test file
bun test --watch             # watch mode
bun test --coverage          # coverage report
bun run typecheck            # tsc --noEmit (strict mode)
bun run biome:fix            # lint + format with Biome
```

## Architecture

The entry point is `src/index.ts` which orchestrates the full review pipeline:

1. **Config** (`src/config.ts`) — Loads `.prreviewer.yml` via Zod schema. Defines severity threshold, ignore globs, clustering, max files, and planning toggle.

2. **ADO Client** (`src/ado/client.ts`) — All Azure DevOps REST API interactions. Fetches PR metadata, iteration diffs, bot threads. Creates/resolves comment threads. Handles reconciliation of new findings against existing bot threads (fingerprint-based dedup). Contains `formatThreadBody` which uses ````suggestion` fences that ADO renders as "Apply change" buttons.

3. **Review** (`src/review.ts`) — Defines the `emit_finding` custom tool and delegates prompt rendering to `prompts/`. Findings are fingerprinted via SHA-256 hash of `filePath|category|title|startLine`.

4. **Prompts** (`src/prompts/`) — Separated prompt templates and agent configs:
   - `templates.ts` — Pure render functions for system, file, and planning prompts.
   - `agents.ts` — Specialist sub-agent configs (`security-reviewer`, `test-reviewer`) with scoped tool lists.
   - `index.ts` — Barrel re-export.

5. **Session** (`src/session.ts`) — Pure function `buildSessionConfig()` that assembles the Copilot SDK `SessionConfig` from inputs (PR metadata, config, tools, agents). Keeps session wiring testable without network calls.

6. **Streaming** (`src/streaming.ts`) — `createStreamingHandler()` factory for the SDK `onEvent` callback. Translates streaming events into console progress output.

7. **Clustering** (`src/cluster.ts`) — Groups similar findings using Jaccard similarity on normalized titles (threshold 0.85). Prevents comment noise when the same issue repeats across files. Clusters above `clusterThreshold` count are collapsed to the primary finding.

8. **Hooks** (`src/hooks.ts`) — Copilot SDK session lifecycle hooks: `onPostToolUse` adds test-companion hints after `read_file`, `onErrorOccurred` retries model errors and aborts system errors, `onSessionEnd`/`onSessionStart` for logging.

9. **Instructions** (`src/instructions.ts`) — Prepends the bundled `.github/instructions/` directory to `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` so the SDK picks up auth and secrets review focus files automatically. Also exports `buildSessionInstructionConfig()` for explicit skill/instruction SDK options.

10. **Types** (`src/types.ts`) — Shared types: `Finding`, `FindingCluster`, `Severity`, `Category`, `Confidence`, `CHANGE_TYPE_LABELS`.

11. **Prototype** (`src/prototype.ts`) — Standalone SDK validation tool (`bun run prototype`). Creates temp sample files and runs the full review pipeline end-to-end. Useful for verifying SDK connectivity without ADO infrastructure.

### Key Design Decisions

- The reviewer **fails gracefully** (exit 0) on all errors to never block PR merges. Missing tokens also exit 0 with a warning.
- Two **custom sub-agents** (`security-reviewer`, `test-reviewer`) are registered with the Copilot SDK session for specialized review of high-risk and test files.
- Destructive SDK tools (`edit_file`, `write_file`, `shell`, `git_push`, `web_fetch`) are explicitly excluded from the session.
- Thread reconciliation uses **fingerprints**: new findings with existing fingerprints aren't re-posted; existing threads whose fingerprints no longer match are auto-resolved.
- ADO API calls use retry with exponential backoff on 429s (max 3 retries).
- The pipeline template is at `templates/pr-review.yml` — uses `$(System.AccessToken)` for ADO PAT.

## Code Style

- **Runtime:** Bun (>= 1.0.26). Uses Bun-specific APIs: `Bun.file()`, `Bun.Glob`, `Bun.CryptoHasher`, `Bun.sleep`.
- **Linter/Formatter:** Biome with tabs, double quotes, semicolons, trailing commas.
- **TypeScript:** Strict mode (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`). Path alias `@/*` maps to `./src/*`.
- **Validation:** Zod v4 for all runtime schemas (config, tool args).
- **Tests:** `bun:test` (describe/test/expect). Tests import directly from `../src/` with `.ts` extensions. Test files mirror source names (`src/foo.ts` → `tests/foo.test.ts`).

## Environment Variables

Required: `COPILOT_GITHUB_TOKEN`, `ADO_PAT`, `ADO_ORG`, `ADO_PROJECT`, `ADO_REPO_ID`, `ADO_PR_ID`. See `.env.example` for the full list with defaults.
