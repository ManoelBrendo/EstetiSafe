# Backlog por Fases

## Corte de MVP comercial

O MVP comercial recomendado inclui:

- Fundacao multi-tenant
- Gestao de documentos obrigatorios
- Versionamento de documentos sanitarios
- Dashboard de conformidade
- Alertas de vencimento
- Logs de auditoria
- Checklist inicial de conformidade
- Integracao com modulos atuais de clientes, anamnese e agenda

Ficam para fase posterior:

- Assinatura digital avancada com certificado
- Workflow complexo de aprovacao
- Automacao por WhatsApp
- App mobile nativo
- Regras regulatarias por municipio em profundidade

## Fase 0 - Fundacao SaaS e migracao do app atual

### Objetivo
Preparar o app atual para multi-tenant sem quebrar a operacao ja existente.

### Entregas
- Criar `Tenant`, `Clinic` e `ClinicMembership`.
- Migrar a relacao atual baseada em `userId` para `clinicId`.
- Ajustar JWT para incluir `activeClinicId`.
- Criar middleware de tenant no backend.
- Criar infraestrutura base de `AuditLog`.
- Backfill automatico: cada usuario atual vira owner da propria clinica.

### Criterios de aceite
- Usuario atual continua fazendo login normalmente.
- Todos os registros antigos aparecem associados a uma clinica padrao criada automaticamente.
- Nenhuma listagem retorna dados de outra clinica.
- Toda criacao/edicao/exclusao gera log basico.

## Fase 1 - Centro de documentos obrigatorios

### Objetivo
Entregar o coracao do compliance: documentos organizados, versionados e auditaveis.

### Entregas
- Modulo de documentos com categorias: legal, sanitario, clientes, residuos, equipamentos.
- Upload via S3/R2/MinIO com presigned URL.
- Versionamento de documentos.
- Metadados de emissao, vencimento, responsavel e status.
- Alertas de vencimento em 90, 30, 15 e 7 dias.
- Dashboard com indicador de documentos validos, vencidos e ausentes.

### Criterios de aceite
- Documento pode receber varias versoes sem perder historico.
- Documento vencido aparece no dashboard e no modulo de auditoria.
- Usuario consegue filtrar por categoria, tipo e status.
- Arquivo armazenado possui checksum e referencia de storage.

## Fase 2 - Documentacao sanitaria controlada

### Objetivo
Dar governanca a POPs, Manual de Biosseguranca e PGRSS.

### Entregas
- Tipos controlados de documentos: POP, BIOSAFETY_MANUAL, PGRSS.
- Estados de versao: draft, active, superseded, archived.
- Publicacao de versao com `effectiveAt` e `reviewDueAt`.
- Historico de alteracoes por usuario.
- Campo `ownerDepartment` e `approvalNotes` para governanca interna.

### Criterios de aceite
- Cada POP pode ter varias versoes, mas apenas uma ativa.
- O sistema aponta POP sem versao ativa como pendencia.
- PGRSS e manual aparecem como obrigatorios no score de conformidade.

## Fase 3 - Registros operacionais

### Objetivo
Digitalizar a rotina auditavel da clinica.

### Entregas
- Registro de esterilizacao.
- Templates de checklist de limpeza.
- Execucao de checklist por turno, area e responsavel.
- Cadastro de equipamentos e manutencoes.
- Logs automaticos de operador, data e validacao.

### Criterios de aceite
- Registro operacional fica vinculado a usuario, clinica e timestamp.
- Dashboard mostra ausencia de registros esperados.
- Manutencoes vencidas aparecem em alertas criticos.

## Fase 4 - Jornada do cliente com evidencias

### Objetivo
Expandir o modulo atual de clientes para prontuario rastreavel e consentimento.

### Entregas
- Evolucao do cliente.
- Historico de procedimentos realizados.
- Template de termo de consentimento por procedimento.
- Gatilho opcional para abrir a tela de assinatura logo apos o cadastro do cliente.
- Registro de assinatura digital simples com hash, IP e device.
- Vinculo entre procedimento, lote de insumo e termo assinado.

### Criterios de aceite
- Procedimento pode ser auditado com cliente, profissional, consentimento e insumos.
- O usuario consegue gerar e assinar o termo dentro do cadastro do cliente sem trocar de modulo.
- Consentimento assinado gera evidencia imutavel.
- Dados sensiveis de saude ficam protegidos por RBAC.

## Fase 5 - Insumos e residuos

### Objetivo
Reduzir riscos com validade, lote e evidencias de descarte.

### Entregas
- Cadastro de produtos e batches.
- Controle de validade e lote.
- Alertas de batches vencendo e vencidos.
- Cadastro da empresa coletora.
- Registro de coletas realizadas.
- Upload de contrato e comprovantes por coleta.

### Criterios de aceite
- Produto vencido impacta score e aparece em alertas.
- Coletas e comprovantes ficam vinculados a clinica e periodo.
- Modulo de residuos pode ser apresentado em auditoria.

## Fase 6 - Motor de auditoria e score

### Objetivo
Transformar tudo em orientacao pratica para fiscalizacao e operacao.

### Entregas
- Tabela de regras de conformidade configuraveis.
- Execucao de `ComplianceRun` programada.
- `ComplianceFinding` com severidade e acao recomendada.
- Score por categoria e score geral.
- Relatorio PDF exportavel.
- Tela de simulacao de auditoria VISA.

### Criterios de aceite
- A clinica consegue ver o que falta e onde corrigir.
- Cada finding aponta o modulo relacionado.
- O PDF exporta score, pendencias e evidencias principais.

## Sequencia tecnica recomendada

1. Fundacao multi-tenant.
2. Documentos + storage + auditoria base.
3. Dashboard de conformidade.
4. POPs / manual / PGRSS.
5. Registros operacionais.
6. Consentimento e historico clinico.
7. Insumos e residuos.
8. Engine de auditoria.
