# ============================================================
# EstetiSafe (L'Appui) — Dockerfile Backend (Multi-stage)
# ============================================================
# Stage 1: Dependências de produção
FROM node:20-alpine AS deps

WORKDIR /app

COPY backend/backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Build (gera o Prisma client)
FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/backend/package*.json ./
RUN npm ci --ignore-scripts

COPY backend/backend/ ./

RUN npx prisma generate

# Stage 3: Imagem de execução enxuta
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Apenas binários do sistema necessários
RUN apk add --no-cache dumb-init

# Copiar apenas o necessário
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# dumb-init garante propagação de sinais Unix (SIGTERM) para graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
