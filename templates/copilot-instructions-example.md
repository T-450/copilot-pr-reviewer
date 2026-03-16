# Copilot Instructions

## Code Style
- Use early returns over deep nesting
- Prefer `const` over `let`
- All public methods must have JSDoc

## Security
- Never log secrets or tokens
- Validate all user input at service boundaries
- Use parameterized queries for database access

## Testing
- Every public function must have a corresponding test
- Use descriptive test names that explain the expected behavior
