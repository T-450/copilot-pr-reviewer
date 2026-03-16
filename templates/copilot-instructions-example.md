# Copilot Instructions Example

Copy this file to `.github/copilot-instructions.md` in your repository to provide
repository-wide coding standards to the AI code reviewer.

---

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`; never use `var`
- Use named exports; avoid default exports
- Semicolons required

## Architecture

- Follow clean architecture: domain logic has no infrastructure dependencies
- API controllers should be thin — delegate to service layer
- Database access only through repository pattern

## Naming Conventions

- PascalCase for types, interfaces, and classes
- camelCase for functions, variables, and properties
- UPPER_SNAKE_CASE for constants

## Security

- Never log sensitive data (tokens, passwords, PII)
- Validate all external inputs at system boundaries
- Use parameterized queries — never concatenate SQL
- Apply least-privilege principle for API permissions

## Testing

- Every new feature must include unit tests
- Integration tests required for API endpoints
- Test file naming: `*.test.ts` (TypeScript) or `*Tests.cs` (C#)
