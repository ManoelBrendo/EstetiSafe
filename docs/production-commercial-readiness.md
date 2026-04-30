# Preparação para produção comercial

Este documento é o checklist operacional para colocar o L'Appui em um ambiente comercial com menos risco de configuração, indisponibilidade ou exposição indevida.

## Objetivo

Antes de vender ou liberar para clínicas reais, o projeto precisa passar por quatro portões:

1. Ambiente configurado com segredos reais.
2. Banco PostgreSQL disponível e migrado.
3. Backend com healthcheck e readiness check funcionando.
4. Frontend publicado apontando para a API correta.

## Portão 1: variáveis obrigatórias

No backend, copie `backend/backend/.env.example` para `.env` no provedor de produção e configure valores reais.

Obrigatórias para produção:

- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `SUPPORT_ADMIN_EMAIL`
- `SUPPORT_ADMIN_PASSWORD`
- `BILLING_WEBHOOK_SECRET`

Regras importantes:

- `FRONTEND_URL` deve usar HTTPS e não pode apontar para localhost em produção.
- `JWT_SECRET` deve ser longo e aleatório.
- `BILLING_WEBHOOK_SECRET` deve ser longo e diferente do JWT.
- `SUPPORT_ADMIN_PASSWORD` não pode usar valor de exemplo.

Comando de validação:

```bash
cd backend/backend
npm run verify:prod
```

Esse comando não substitui teste funcional, mas impede o erro clássico de subir produção com segredo fraco, CORS local ou variável faltando.

## Portão 2: banco e migração

Fluxo recomendado:

```bash
cd backend/backend
npm ci
npm run deploy
npm run verify:prod
npm start
```

Depois de iniciar o backend, verifique:

```text
GET /health
GET /ready
```

Uso esperado:

- `/health`: confirma que o processo HTTP está vivo.
- `/ready`: confirma que o backend consegue consultar o banco.

Se `/health` responder e `/ready` falhar, o problema geralmente está no `DATABASE_URL`, rede do provedor, SSL do PostgreSQL ou migração ausente.

## Portão 3: frontend

No frontend, configure:

```text
VITE_API_URL=https://sua-api-em-producao.com
```

Validação antes de publicar:

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Depois do deploy, abra o SaaS no navegador e confirme:

- login abre sem network error;
- dashboard carrega;
- clientes e prontuário abrem;
- documentos e auditoria abrem;
- assinatura/contas abre sem erro;
- intercorrências abre e lista registros;
- suporte aparece com contato real.

## Portão 4: segurança mínima

O backend aplica headers básicos de segurança:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security` quando `NODE_ENV=production`

Também existe validação de CORS por `FRONTEND_URL`.

## Checklist comercial antes de vender

- CI verde no GitHub.
- `npm run verify:prod` aprovado no backend.
- Banco PostgreSQL com backup automático ativo no provedor.
- Domínio HTTPS configurado para frontend e API.
- Contato de suporte real configurado.
- Senha de suporte guardada fora do GitHub.
- Teste manual de cadastro, login, cliente, anamnese, prontuário, documentos, financeiro e intercorrências.
- Primeiro cliente piloto ciente de que gateway financeiro e WhatsApp dependem das credenciais reais do provedor.

## Pontos que ainda precisam de decisão comercial

- Provedor definitivo de pagamento recorrente/Pix/cartão.
- Política de backup e retenção de prontuários.
- Termos jurídicos comerciais: contrato, política de privacidade e termos de uso.
- Domínio oficial do produto.
- Plano de suporte: horário, canal e SLA.