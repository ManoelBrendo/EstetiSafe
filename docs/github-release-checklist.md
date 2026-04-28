# GitHub release checklist

Use this checklist before pushing a larger development batch to GitHub.

## Repository hygiene

- Keep real environment files out of Git.
- Keep generated folders out of Git: `node_modules`, `dist`, `build`, logs, screenshots, local zips and installers.
- Keep active backend code under `backend/backend`.
- Keep drafts and non-runtime snippets under `docs/technical-drafts`.

## Validation commands

Run these before committing:

```bash
cd backend/backend
npm run lint
npm run typecheck
npm test
```

```bash
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Manual smoke test

- Open `http://localhost:5173`.
- Confirm backend health at `http://localhost:3000/health`.
- Login/register flow opens without network error.
- Dashboard loads.
- Clients, anamnesis, records, documents and billing pages open.
- Financial gateway card shows status without crashing.

## Commit guidance

Recommended split when possible:

1. UX and frontend improvements.
2. Medical record consent/security changes.
3. WhatsApp integration foundation.
4. Billing gateway foundation.
5. TypeScript migration setup.
6. Documentation and repository hygiene.

If committing as one batch, use a broad message such as:

```text
feat: improve clinical flows and prepare gateway integrations
```

## Known non-blocking notes

- Vite may print a CJS API deprecation warning during build/test. It does not block the current build.
- Full `npm audit` can still report moderate dev-tool warnings related to Vite/esbuild/vitest. Production audit is clean with `npm audit --omit=dev`.
- Avoid `npm audit fix --force` until the Vite major upgrade is planned and tested.
