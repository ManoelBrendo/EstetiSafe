# Plano de Implementacao

## Leitura honesta do projeto atual

Hoje o projeto e um monolito simples e funcional:

- Frontend em arquivos de pagina na raiz do app Vite.
- Backend com todas as rotas dentro de `server.js`.
- Schema Prisma unico e focado em operacao da clinica.
- Nao existe tenant, clinic ou RBAC estruturado.
- Nao existe modulo de documentos, storage externo ou auditoria robusta.

Essa base e boa para MVP, mas precisa de reorganizacao antes do modulo de compliance crescer.

## Decisao de arquitetura recomendada

### Backend
Migrar de `server.js` para estrutura modular sem quebrar a API de uma vez.

Estrutura alvo:

```txt
backend/backend/src
  app.js
  server.js
  config/
  middleware/
  modules/
    auth/
    clinics/
    documents/
    compliance/
    clients/
    operations/
    inventory/
    waste/
    audit/
  services/
    storage/
    pdf/
    alerts/
    compliance-engine/
  lib/
```

### Frontend
Migrar de paginas soltas para modulos por dominio.

Estrutura alvo:

```txt
frontend/src
  app/
  components/
  layouts/
  modules/
    auth/
    dashboard/
    clients/
    appointments/
    compliance/
    documents/
    operations/
    inventory/
    waste/
    settings/
  lib/
  hooks/
```

## Estrategia de migracao sem trauma

### Passo 1 - Introduzir tenant e clinic sem quebrar login
- Criar tabelas `Tenant`, `Clinic` e `ClinicMembership`.
- Backfill: para cada `User` atual, criar um `Tenant` e uma `Clinic` usando `clinicName`.
- Adicionar `clinicId` nas tabelas operacionais atuais.
- Ajustar auth para resolver `activeClinicId`.

### Passo 2 - Preservar a API atual com adaptadores
- `/clients`, `/services`, `/appointments` continuam existindo.
- Internamente, passam a operar com `clinicId`.
- Isso permite continuar vendendo e usando o app enquanto os modulos de compliance entram.

### Passo 3 - Introduzir modulo de documentos
- Criar API nova em paralelo: `/v1/documents`.
- Adicionar UI nova ao menu sem desmontar o dashboard atual.
- Integrar score de conformidade no dashboard existente.

## Ordem recomendada de desenvolvimento no codigo

### Sprint 1
- Criar `Tenant`, `Clinic`, `ClinicMembership`, `AuditLog`.
- Atualizar JWT e middleware.
- Backfill de dados atuais.
- Criar `GET /v1/clinics/current`.

### Sprint 2
- Criar `FileObject`, `Document`, `DocumentVersion`.
- Integrar storage S3/R2.
- Criar listagem e upload de documentos.
- Adicionar card de documentos vencendo no dashboard.

### Sprint 3
- Criar controlled documents (POP, manual, PGRSS).
- Adicionar historico e publicacao.
- Criar findings basicos de documentos obrigatorios.

### Sprint 4
- Criar equipamentos, manutencoes, esterilizacao e limpeza.
- Integrar findings operacionais.
- Adicionar checklist rapido mobile-first.

### Sprint 5
- Criar consentimento, procedimento e evolucao do cliente.
- Abrir fluxo de assinatura imediatamente apos o cadastro do cliente, dentro da pagina do proprio cliente.
- Vincular lote de insumo ao procedimento.
- Adicionar trilha auditavel clinica.

### Sprint 6
- Criar inventario, batches e residuos.
- Fechar score de conformidade.
- Gerar PDF de auditoria.

## Arquivos atuais que devem mudar primeiro

### Frontend
- `frontend/App.jsx`: registrar novas rotas.
- `frontend/Layout.jsx`: novo menu por modulos.
- `frontend/Dashboard.jsx`: mesclar operacao + conformidade.
- `frontend/api.js`: suporte a `X-Clinic-Id`, modulos e interceptors por tenant.
- Criar paginas novas:
  - `Documentos.jsx`
  - `DocumentoDetalhe.jsx`
  - `Biosseguranca.jsx`
  - `Operacao.jsx`
  - `Insumos.jsx`
  - `Residuos.jsx`
  - `Auditoria.jsx`
  - `ConfiguracoesClinica.jsx`
  - `ClienteConsentimentoAssinatura.jsx`

### Backend
- `backend/backend/server.js`: extrair para `src/`.
- `backend/backend/schema.prisma`: evoluir para o schema v2.
- Criar modulos novos:
  - `documents`
  - `compliance`
  - `operations`
  - `inventory`
  - `waste`
  - `audit`

## Decisoes de produto importantes

1. A checklist regulatoria nao deve ser fixa no frontend.
2. O score deve ser configuravel por regra e por perfil de clinica.
3. Documentos e evidencias precisam de hash e versionamento.
4. O sistema deve permitir marcar item como `nao aplicavel` com justificativa.
5. O consentimento deve nascer dentro do contexto do cliente, nao como modulo solto.

## Primeira entrega recomendada para o proximo ciclo de codigo

Se fossemos comecar a implementar amanha, eu abriria exatamente nesta ordem:

1. migracao Prisma para `Tenant`, `Clinic`, `ClinicMembership`, `AuditLog`
2. adaptacao do auth para `activeClinicId`
3. backfill dos registros atuais
4. modulo `documents` com upload e vencimento
5. cards de compliance no dashboard atual

Isso da um incremento vendavel sem esperar o sistema inteiro ficar pronto.
