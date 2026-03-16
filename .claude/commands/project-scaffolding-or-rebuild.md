---
name: project-scaffolding-or-rebuild
description: Workflow command scaffold for project-scaffolding-or-rebuild in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /project-scaffolding-or-rebuild

Use this workflow when working on **project-scaffolding-or-rebuild** in `copilot-pr-reviewer`.

## Goal

Initializes or rebuilds the project from a boilerplate or template, replacing or adding a large set of configuration, source, and test files.

## Common Files

- `.editorconfig`
- `.gitignore`
- `README.md`
- `CLAUDE.md`
- `package.json`
- `bun.lock`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Add or replace configuration files (.editorconfig, .gitignore, tsconfig.json, etc.)
- Add or replace package manager and tool configs (package.json, bun.lock, bunfig.toml, etc.)
- Add or replace source files under src/
- Add or replace test files under __tests__/ or src/
- Add or replace documentation (README.md, CLAUDE.md, templates/)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.