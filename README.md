# L'Appui SaaS

L'Appui is a web SaaS for aesthetic clinics focused on operational clarity, clinical records, regulatory compliance, and technical support.

## Product focus

The platform is organized around the routines that matter most to a clinic:

- client base, anamnesis, consent, and medical records
- document control and compliance readiness
- services, POPs, schedule, and professionals
- inventory, equipment, billing, and support operations

## Repository layout

```text
.
|- frontend/          # React + Vite web application
|- backend/backend/   # Node.js + Express + Prisma API
|- docs/              # Product and implementation notes
|- .github/           # GitHub Actions workflows
```

## Main stack

- Frontend: React, Vite, TypeScript migration in progress, Axios, React Router
- Backend: Node.js, Express, Prisma, PostgreSQL, Zod, PDFKit
- Testing: Vitest on the frontend and Node test runner on the backend

## Current technical status

- The frontend is being migrated progressively from JavaScript to TypeScript.
- Core auth, clinical flows, documents, dashboard, billing, and inventory are already typed.
- CI is configured to lint, test, and build both application layers.

## Local setup

### 1. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### 2. Backend

```bash
cd backend/backend
cp .env.example .env
npm install
npm run start
```

## Environment variables

- Frontend example: [frontend/.env.example](frontend/.env.example)
- Backend example: [backend/backend/.env.example](backend/backend/.env.example)

Never commit real `.env` files to GitHub.

## Useful scripts

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm run typecheck
npm run test
```

### Backend

```bash
cd backend/backend
npm run start
npm run typecheck
npm run lint
npm test
npm run test:integration
```

## CI

The repository already includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for:

- backend typecheck, lint, and tests
- backend integration tests
- frontend typecheck, lint, tests, and build

## Git workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- branch naming conventions
- commit message style
- pull request checklist

## Notes

- `backend/backend` is intentionally preserved to avoid breaking the current deployment structure.
- The project is currently desktop-first, with mobile handled as a responsive fallback.
- The repository ignores local runtime artifacts, logs, screenshots, builds, and `.env` files.
