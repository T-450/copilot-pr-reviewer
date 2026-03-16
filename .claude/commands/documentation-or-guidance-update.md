---
name: documentation-or-guidance-update
description: Workflow command scaffold for documentation-or-guidance-update in copilot-pr-reviewer.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /documentation-or-guidance-update

Use this workflow when working on **documentation-or-guidance-update** in `copilot-pr-reviewer`.

## Goal

Adds or updates project documentation or guidance files, such as README.md or CLAUDE.md.

## Common Files

- `README.md`
- `CLAUDE.md`
- `.gitignore`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Add or update documentation files (e.g., README.md, CLAUDE.md)
- Optionally update .gitignore or related config files

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.