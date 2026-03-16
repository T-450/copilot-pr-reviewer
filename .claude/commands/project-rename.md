---
name: project-rename
description: Workflow command scaffold for project-rename in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /project-rename

Use this workflow when working on **project-rename** in `copilot-pr-reviewer`.

## Goal

Renames the project by updating relevant metadata and documentation files.

## Common Files

- `README.md`
- `package.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update project name in README.md
- Update project name in package.json

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.