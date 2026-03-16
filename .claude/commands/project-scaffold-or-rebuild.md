---
name: project-scaffold-or-rebuild
description: Workflow command scaffold for project-scaffold-or-rebuild in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /project-scaffold-or-rebuild

Use this workflow when working on **project-scaffold-or-rebuild** in `copilot-pr-reviewer`.

## Goal

Sets up or rebuilds the project from a boilerplate or new stack, replacing runtime, updating all configs, source, and test files.

## Common Files

- `.editorconfig`
- `.gitignore`
- `.nvmrc`
- `.prettierrc`
- `package.json`
- `package-lock.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Remove old runtime-specific files (e.g., bun.lock, bunfig.toml)
- Add or update configuration files (.editorconfig, .gitignore, .nvmrc, .prettierrc, tsconfig*.json, eslint configs, package.json, package-lock.json)
- Scaffold or replace all source files under src/
- Add or update test files under __tests__/ and src/**.test.ts
- Update documentation (README.md, CLAUDE.md, templates/)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.