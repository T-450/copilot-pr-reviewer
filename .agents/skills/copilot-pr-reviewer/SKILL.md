---
name: copilot-pr-reviewer-conventions
description: Development conventions and patterns for copilot-pr-reviewer. TypeScript project with conventional commits.
---

# Copilot Pr Reviewer Conventions

> Generated from [T-450/copilot-pr-reviewer](https://github.com/T-450/copilot-pr-reviewer) on 2026-03-16

## Overview

This skill teaches Claude the development patterns and conventions used in copilot-pr-reviewer.

## Tech Stack

- **Primary Language**: TypeScript
- **Architecture**: hybrid module organization
- **Test Location**: separate
- **Test Framework**: vitest

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 4 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `feat`
- `chore`

### Message Guidelines

- Average message length: ~61 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
feat: rebuild project from node-typescript-boilerplate with Node.js 22 + Vitest
```

*Commit message example*

```text
chore: rename project from volvo-pr-reviewer to copilot-pr-reviewer
```

*Commit message example*

```text
Add CLAUDE.md with project guidance for Claude Code
```

*Commit message example*

```text
feat: Copilot SDK PR reviewer for Azure DevOps
```

## Architecture

### Project Structure: Single Package

This project uses **hybrid** module organization.

### Source Layout

```
src/
├── ado/
├── config/
├── copilot/
├── core/
├── repo/
├── telemetry/
```

### Entry Points

- `src/index.ts`

### Configuration Files

- `.prettierrc`
- `__tests__/vitest.config.ts`
- `package.json`
- `tsconfig.json`

### Guidelines

- This project uses a hybrid organization
- Follow existing patterns when adding new code

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | camelCase |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Relative Imports

### Export Style: Named Exports


*Preferred import style*

```typescript
// Use relative imports
import { Button } from '../components/Button'
import { useAuth } from './hooks/useAuth'
```

*Preferred export style*

```typescript
// Use named exports
export function calculateTotal() { ... }
export const TAX_RATE = 0.1
export interface Order { ... }
```

## Testing

### Test Framework: vitest

### File Pattern: `*.test.ts`

### Test Types

- **Unit tests**: Test individual functions and components in isolation
- **Integration tests**: Test interactions between multiple components/services

### Coverage

This project has coverage reporting configured. Aim for 80%+ coverage.


*Test file structure*

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFunction', () => {
  it('should return expected result', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })
})
```

## Error Handling

### Error Handling Style: Try-Catch Blocks


*Standard error handling pattern*

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly message')
}
```

## Common Workflows

These workflows were detected from analyzing commit patterns.

### Project Scaffold Or Rebuild

Sets up or rebuilds the project from a boilerplate or new stack, replacing runtime, updating all configs, source, and test files.

**Frequency**: ~2 times per month

**Steps**:
1. Remove old runtime-specific files (e.g., bun.lock, bunfig.toml)
2. Add or update configuration files (.editorconfig, .gitignore, .nvmrc, .prettierrc, tsconfig*.json, eslint configs, package.json, package-lock.json)
3. Scaffold or replace all source files under src/
4. Add or update test files under __tests__/ and src/**.test.ts
5. Update documentation (README.md, CLAUDE.md, templates/)
6. Add or update CI/CD templates (e.g., Azure Pipelines YAML)

**Files typically involved**:
- `.editorconfig`
- `.gitignore`
- `.nvmrc`
- `.prettierrc`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.*.json`
- `eslint.config.*`
- `src/**/*.ts`
- `src/**/*.test.ts`
- `__tests__/**/*.test.ts`
- `README.md`
- `CLAUDE.md`
- `templates/*.md`
- `templates/*.yml`

**Example commit sequence**:
```
Remove old runtime-specific files (e.g., bun.lock, bunfig.toml)
Add or update configuration files (.editorconfig, .gitignore, .nvmrc, .prettierrc, tsconfig*.json, eslint configs, package.json, package-lock.json)
Scaffold or replace all source files under src/
Add or update test files under __tests__/ and src/**.test.ts
Update documentation (README.md, CLAUDE.md, templates/)
Add or update CI/CD templates (e.g., Azure Pipelines YAML)
```

### Documentation Or Guidance Update

Adds or updates project documentation or guidance files, such as README.md or CLAUDE.md.

**Frequency**: ~2 times per month

**Steps**:
1. Add or update documentation files (e.g., README.md, CLAUDE.md)
2. Optionally update .gitignore or related config files

**Files typically involved**:
- `README.md`
- `CLAUDE.md`
- `.gitignore`

**Example commit sequence**:
```
Add or update documentation files (e.g., README.md, CLAUDE.md)
Optionally update .gitignore or related config files
```

### Project Rename

Renames the project by updating relevant metadata and documentation files.

**Frequency**: ~2 times per month

**Steps**:
1. Update project name in README.md
2. Update project name in package.json

**Files typically involved**:
- `README.md`
- `package.json`

**Example commit sequence**:
```
Update project name in README.md
Update project name in package.json
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Write tests using vitest
- Follow *.test.ts naming pattern
- Use camelCase for file names
- Prefer named exports

### Don't

- Don't write vague commit messages
- Don't skip tests for new features
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
