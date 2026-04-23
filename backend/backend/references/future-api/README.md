# Future API Blueprint

Este pacote deixa salva, de forma isolada, a futura API completa do L'Appui baseada no schema Prisma acordado para a proxima fase do produto.

## Objetivo

- manter a API atual intacta
- guardar a arquitetura futura no proprio projeto
- preparar uma base modular em Express + Prisma + Zod
- registrar o comportamento de bloqueio do prontuario apos pagamento

## Estado deste pacote

- nao esta ligado ao runtime atual do SaaS
- fica salvo apenas como blueprint pronto para evolucao
- usa o schema Prisma futuro em `prisma/schema.prisma`
- pode ser ativado depois com instalacao dedicada, migrate/db push e ligacao ao auth definitivo

## Observacao importante sobre multi-tenant e autenticacao

O schema de referencia enviado por voce ainda nao inclui entidades como `Clinic`, `User`, `Membership` ou escopo multi-tenant. Por isso:

- a estrutura de rotas ja esta preparada para JWT
- o middleware de autenticacao assume claims como `userId`, `clinicId` e `role`
- antes de colocar essa API em producao, sera preciso conectar esse pacote ao servico de autenticacao/contas da plataforma ou expandir o schema com as tabelas de tenancy

## Estrutura

- `prisma/schema.prisma`: schema futuro salvo para a nova API
- `src/app.js`: composicao do Express
- `src/server.js`: bootstrap do servidor
- `src/lib`: Prisma, erros HTTP, auditoria e helpers
- `src/middleware`: autenticacao, validacao e bloqueio do prontuario
- `src/routes`: modulos por dominio
- `src/schemas`: contratos Zod da API

## Modulos previstos

- health
- auth
- clients
- medical-records
- services
- protocols
- appointments
- payments
- documents
- whatsapp
- audit-logs

## Regras de negocio ja refletidas aqui

- criacao de cliente gera automaticamente `medicalRecord`
- pagamento `paid` bloqueia o prontuario (`isPaid`, `isLocked`, `lockedAt`)
- prontuario bloqueado impede alteracoes em anamnese, protocolos e agendamentos sensiveis
- confirmacao de pagamento e mudancas em campos financeiros protegidos ficam reservadas para suporte ou administracao
- clientes e prontuarios ja contam com endpoints de overview, timeline e estado de acesso para leitura protegida
- desbloqueio fica reservado para camada de suporte/operacao
- auditoria pode registrar `create`, `update`, `delete`, `lock`, `unlock`, `generate_pdf`, `send_whatsapp`, `check_in` e `check_out`

## Rotas planejadas

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### Clients
- `GET /api/clients`
- `POST /api/clients`
- `GET /api/clients/:id`
- `GET /api/clients/:id/overview`
- `GET /api/clients/:id/timeline`
- `PATCH /api/clients/:id`
- `PATCH /api/clients/:id/status`
- `GET /api/clients/:id/medical-record`

### Medical records
- `GET /api/medical-records/by-client/:clientId`
- `GET /api/medical-records/:id`
- `GET /api/medical-records/:id/summary`
- `GET /api/medical-records/:id/access-state`
- `PUT /api/medical-records/:id/anamnesis`
- `PUT /api/medical-records/:id/evaluations`
- `PATCH /api/medical-records/:id/lock`
- `PATCH /api/medical-records/:id/unlock`

### Services
- `GET /api/services`
- `POST /api/services`
- `GET /api/services/:id`
- `PATCH /api/services/:id`
- `DELETE /api/services/:id`

### Protocols
- `GET /api/protocols`
- `POST /api/protocols`
- `GET /api/protocols/:id`
- `PATCH /api/protocols/:id`
- `PUT /api/protocols/:id/services`
- `PATCH /api/protocols/:id/status`
- `DELETE /api/protocols/:id`

### Appointments
- `GET /api/appointments`
- `POST /api/appointments`
- `GET /api/appointments/:id`
- `PATCH /api/appointments/:id`
- `PATCH /api/appointments/:id/status`
- `DELETE /api/appointments/:id`

### Payments
- `GET /api/payments`
- `POST /api/payments`
- `POST /api/payments/:id/confirm`
- `GET /api/payments/:id`
- `PATCH /api/payments/:id`

### Documents
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id`

### WhatsApp
- `GET /api/whatsapp-messages`
- `POST /api/whatsapp-messages`
- `PATCH /api/whatsapp-messages/:id/delivery`

### Audit logs
- `GET /api/audit-logs`

## Como ativar depois

1. entrar em `references/future-api`
2. copiar `.env.example` para `.env`
3. instalar dependencias
4. rodar `npm run prisma:generate`
5. rodar `npm run prisma:push`
6. conectar o middleware de auth ao servico real de contas/clinicas
7. ligar adaptadores de PDF e mensageria

## Integracoes mapeadas para a proxima fase

- geracao real de PDF do prontuario e relatorios
- envio real de WhatsApp
- multi-tenant nativo no banco
- escopo por clinica e por profissional
- permissao de suporte para unlock administrativo e manutencao auditada
