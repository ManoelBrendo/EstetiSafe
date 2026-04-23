# Future Clinical API

Esta pasta guarda a base da API futura do prontuario clinico, separada do backend legado.

## Objetivo

- preservar a API atual em `server.js` e `src/api-v2`
- deixar salvo um backend mais modular para o schema Prisma futuro
- cobrir o dominio clinico com rotas de clientes, prontuario, protocolos, agendamentos, pagamentos, documentos e mensagens
- manter a regra juridica de bloqueio do prontuario apos pagamento confirmado

## Estrutura

- `createFutureClinicalApiRouter.js`: ponto de entrada da API futura
- `schemas.js`: validacoes Zod
- `lib/`: helpers HTTP, auditoria, serializers e regra de prontuario
- `modules/`: rotas por contexto de negocio

## Regra importante ja aplicada

Quando um pagamento entra com `paymentStatus = "paid"`, o prontuario vinculado eh marcado com:

- `isPaid = true`
- `isLocked = true`
- `lockedAt = data do pagamento ou timestamp atual`

Com isso a base futura ja respeita a regra de integridade que voce pediu para o prontuario.

## Como montar depois

Quando voce quiser ativar essa camada, a ideia eh montar algo assim no backend real:

```js
const { createFutureClinicalApiRouter } = require('./src/api-future/createFutureClinicalApiRouter')

app.use('/api/future', createFutureClinicalApiRouter({
  prisma,
  auth: {
    authMiddleware,
    requireScopedClinicUser,
  },
}))
```

## Observacao arquitetural

O schema futuro enviado por voce cobre muito bem o dominio clinico do prontuario, mas ainda nao traz tabelas de autenticacao, usuario e tenant. Entao essa API foi preparada para receber a autenticacao por adaptador externo, sem acoplar o dominio clinico ao legado agora.
