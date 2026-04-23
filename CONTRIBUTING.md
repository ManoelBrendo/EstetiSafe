# Contributing

This repository uses a simple workflow to keep releases predictable and work easy to review.

## Branch strategy

- `main`: stable branch, always expected to be releasable
- `codex/<scope>`: work produced by Codex during guided implementation
- `feat/<scope>`: new features
- `fix/<scope>`: bug fixes
- `refactor/<scope>`: structural changes without feature changes
- `docs/<scope>`: documentation-only work

Examples:

- `codex/github-readme-ts-scheduling`
- `feat/document-audit-mode`
- `fix/login-validation`
- `refactor/backend-api-v2`

## Commit message pattern

Use short conventional commits:

- `feat: add regulatory score to documents`
- `fix: correct login validation feedback`
- `refactor: migrate scheduling module to TypeScript`
- `docs: improve repository onboarding`
- `test: add billing integration coverage`
- `chore: prepare repository for GitHub`

## Pull request checklist

Before opening or merging a PR:

1. run the relevant tests
2. run `npm run build` for the affected app
3. confirm `.env` files were not staged
4. review UI text for broken encoding or inconsistent labels
5. describe the business impact, not only the code change

## Scope discipline

- Prefer small, focused commits.
- Avoid mixing structural refactors with unrelated UI changes.
- If a change touches both frontend and backend, explain the contract between them.
