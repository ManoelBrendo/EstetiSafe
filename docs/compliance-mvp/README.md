# L'Appui Compliance MVP

Este pacote traduz o projeto atual do L'Appui para um roadmap pratico de evolucao rumo a um SaaS multi-tenant de gestao, compliance sanitario e rastreabilidade para clinicas de estetica.

## O que ja existe no projeto

- Frontend React + Vite com autenticacao e rotas privadas.
- Backend Node.js + Express com JWT.
- PostgreSQL via Prisma.
- Modulos operacionais ja implementados: clientes, anamnese, servicos, profissionais, agendamentos, pagamentos e dashboard.
- UX/UI premium e responsiva para uso em desktop e mobile.

## O que este pacote entrega

- Backlog por fases para desenvolvimento incremental.
- Contratos de API para os novos dominios de compliance.
- Mapa de rotas web/mobile e descricoes das telas principais.
- Plano de implementacao em cima do codigo atual.
- Rascunho de schema Prisma v2 multi-tenant e compliance em `backend/backend/schema.compliance-mvp.prisma`.

## Principios de arquitetura

1. Multi-tenant desde a base: tenant, clinic e membership.
2. Isolamento logico por `clinicId` em todas as entidades operacionais.
3. Compliance-first: toda evidencia importante gera trilha de auditoria.
4. Documentos e evidencias versionados, com hash e storage externo.
5. Regras de conformidade configuraveis por perfil de clinica e localidade.
6. MVP web-first responsivo; mobile nativo pode vir depois sem reescrever o dominio.

## Base regulatoria inicial usada para o desenho

- LGPD (Lei 13.709/2018) para dados pessoais sensiveis de saude.
- ANVISA RDC 222/2018 para gerenciamento de residuos de servicos de saude.
- ANVISA RDC 15/2012 para processamento de produtos para saude quando houver esterilizacao e reprocessamento aplicavel.
- Regras de licenciamento sanitario municipal/estadual devem ser tratadas por checklist configuravel, porque variam por localidade e escopo da clinica.

## Estrategia recomendada para o projeto atual

- Nao recriar o app do zero.
- Evoluir o app atual para um produto chamado internamente de `L'Appui Compliance`.
- Preservar os modulos operacionais ja prontos como nucleo do sistema.
- Adicionar modulos regulatorios por fases para nao travar a entrega.

## Ordem recomendada de leitura

1. `01-backlog-fases.md`
2. `02-contratos-api.md`
3. `03-rotas-e-telas.md`
4. `04-plano-implementacao.md`
5. `backend/backend/schema.compliance-mvp.prisma`
