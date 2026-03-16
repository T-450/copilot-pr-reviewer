---
name: feature-development-with-tests-and-docs
description: Workflow command scaffold for feature-development-with-tests-and-docs in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-with-tests-and-docs

Use this workflow when working on **feature-development-with-tests-and-docs** in `copilot-pr-reviewer`.

## Goal

Implements a new feature or major refactor, including source code, associated unit tests, and documentation/templates.

## Common Files

- `src/**/*.ts`
- `src/**/*.test.ts`
- `__tests__/**/*.test.ts`
- `README.md`
- `CLAUDE.md`
- `docs/user-guide.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Add or modify multiple source files under src/ (implementation)
- Add or update corresponding test files under __tests__/ or alongside src/ (e.g., src/foo.test.ts)
- Update or add documentation files (README.md, CLAUDE.md, docs/user-guide.md, templates/...)
- Update configuration or type registry files (e.g., src/types.ts, tsconfig.json, package.json)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.