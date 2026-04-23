# L'Appui SaaS

Plataforma web para clinicas de estetica com foco em operacao, prontuario, regularizacao documental e suporte tecnico.

## Estrutura do projeto

```text
.
|- frontend/          # SPA React + Vite
|- backend/backend/   # API REST Node.js + Express + Prisma
|- docs/              # Documentacao complementar
|- .github/           # CI do GitHub Actions
```

## Stack principal

- Frontend: React, Vite, TypeScript progressivo, Axios, React Router
- Backend: Node.js, Express, Prisma, PostgreSQL, Zod, PDFKit
- Testes: Vitest no frontend e Node test runner no backend

## Como rodar localmente

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

## Variaveis de ambiente

- Frontend: veja [frontend/.env.example](frontend/.env.example)
- Backend: veja [backend/backend/.env.example](backend/backend/.env.example)

Nunca suba arquivos `.env` reais para o GitHub.

## Scripts uteis

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
npm run lint
npm test
npm run test:integration
```

## CI

O repositorio ja possui pipeline em [`.github/workflows/ci.yml`](.github/workflows/ci.yml) para:

- lint e testes do backend
- testes de integracao do backend
- lint, testes e build do frontend

## Observacoes para publicacao

- O frontend usa `.env.example` como base para configuracao local.
- O backend depende de PostgreSQL e `DATABASE_URL`.
- A pasta `backend/backend` foi mantida como esta para nao quebrar a estrutura atual do projeto.

## Proximo passo para subir ao GitHub

Depois desta preparacao, os comandos padrao sao:

```bash
git init -b main
git add .
git commit -m "chore: prepare repository for GitHub"
git remote add origin <url-do-repositorio>
git push -u origin main
```
