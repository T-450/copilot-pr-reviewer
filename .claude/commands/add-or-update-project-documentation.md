---
name: add-or-update-project-documentation
description: Workflow command scaffold for add-or-update-project-documentation in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-project-documentation

Use this workflow when working on **add-or-update-project-documentation** in `copilot-pr-reviewer`.

## Goal

Adds or updates project-level documentation or guidance files, such as README.md or CLAUDE.md, often alongside .gitignore or package.json.

## Common Files

- `README.md`
- `CLAUDE.md`
- `.gitignore`
- `package.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update documentation file (e.g. README.md, CLAUDE.md)
- Optionally update .gitignore or package.json to reflect new docs or project name

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.