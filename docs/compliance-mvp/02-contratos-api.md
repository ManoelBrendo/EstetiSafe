# Contratos de API

## Convencoes gerais

- Prefixo recomendado: `/v1`.
- Autenticacao: `Authorization: Bearer <token>`.
- Resolucao da clinica ativa: `X-Clinic-Id` quando o usuario tiver acesso a mais de uma clinica.
- Todas as respostas de erro devem seguir o contrato:

```json
{
  "error": "codigo_ou_mensagem",
  "message": "Descricao legivel",
  "details": [],
  "requestId": "uuid"
}
```

## Auth e tenant

### POST /v1/auth/register
Cria tenant inicial, clinica inicial e membership owner.

```json
{
  "email": "owner@clinica.com",
  "password": "Senha@123",
  "clinicName": "L'Appui Maison",
  "legalName": "Clinica Exemplo Ltda",
  "cnpj": "00.000.000/0001-00"
}
```

### POST /v1/auth/login
Retorna token com `userId`, `tenantId`, `activeClinicId`, `role`.

### POST /v1/auth/refresh
Renova sessao.

### GET /v1/auth/me
Retorna usuario, memberships e clinica ativa.

### POST /v1/auth/switch-clinic
Troca `activeClinicId`.

## Dashboard

### GET /v1/dashboard/overview
Retorna resumo operacional + resumo de compliance.

```json
{
  "clinic": {
    "id": "uuid",
    "tradeName": "L'Appui Maison"
  },
  "operations": {
    "clients": 245,
    "appointmentsToday": 18,
    "revenueMonth": 12450.50
  },
  "compliance": {
    "score": 82,
    "criticalAlerts": 2,
    "expiredDocuments": 1,
    "missingRecords": 3
  },
  "nextActions": []
}
```

## Documentos

### GET /v1/documents
Query params sugeridos:
- `category`
- `type`
- `status`
- `expiresBefore`
- `search`

### POST /v1/documents
Cria o container do documento.

```json
{
  "category": "LEGAL",
  "type": "SANITARY_LICENSE",
  "title": "Alvara sanitario 2026",
  "issueDate": "2026-01-05",
  "expiresAt": "2027-01-05",
  "ownerDepartment": "Administrativo"
}
```

### POST /v1/files/presign
Gera URL assinada para upload.

### POST /v1/documents/:id/versions
Anexa uma nova versao ao documento.

```json
{
  "versionNumber": 2,
  "storageKey": "documents/clinic-1/alvara-v2.pdf",
  "fileName": "alvara-v2.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "sha256": "...",
  "summary": "Renovacao anual",
  "status": "ACTIVE"
}
```

### GET /v1/documents/:id/history
Retorna historico de versoes.

### GET /v1/documents/expiring
Retorna documentos vencidos e a vencer.

## Documentacao sanitaria controlada

### GET /v1/controlled-documents
Filtros por `type in [POP, BIOSAFETY_MANUAL, PGRSS]`.

### POST /v1/controlled-documents
Cria documento controlado.

### POST /v1/controlled-documents/:id/publish
Publica versao.

```json
{
  "versionId": "uuid",
  "effectiveAt": "2026-04-10T12:00:00Z",
  "reviewDueAt": "2026-10-10T12:00:00Z"
}
```

## Registros operacionais

### POST /v1/sterilization/cycles

```json
{
  "equipmentId": "uuid",
  "cycleAt": "2026-04-09T08:30:00Z",
  "loadDescription": "Instrumentais faciais inox",
  "chemicalIndicatorResult": "PASS",
  "biologicalIndicatorResult": "PENDING",
  "notes": "Carga liberada apos conferencia"
}
```

### GET /v1/sterilization/cycles
Lista por periodo e equipamento.

### POST /v1/cleaning/runs

```json
{
  "templateId": "uuid",
  "performedAt": "2026-04-09T07:00:00Z",
  "shift": "MORNING",
  "answers": {
    "maca_higienizada": true,
    "pia_desinfectada": true
  }
}
```

### POST /v1/equipment/maintenance

```json
{
  "equipmentId": "uuid",
  "maintenanceType": "PREVENTIVE",
  "scheduledAt": "2026-05-01T09:00:00Z",
  "supplierName": "Assistencia Tecnica X",
  "cost": 350.00
}
```

## Clientes e prontuario

### GET /v1/clients
### POST /v1/clients
### GET /v1/clients/:id
### PUT /v1/clients/:id

### GET /v1/clients/:id/anamneses
### POST /v1/clients/:id/anamneses

### GET /v1/clients/:id/consent-records
### POST /v1/clients/:id/consent-records
Gera um consentimento vinculado ao cadastro do cliente para abrir a tela de assinatura logo apos o cadastro ou antes de um procedimento.

```json
{
  "templateId": "uuid",
  "procedureName": "Microagulhamento facial",
  "renderedHtml": "<html>...</html>"
}
```

### POST /v1/clients/:id/consent-records/generate-default
Gera automaticamente o termo padrao da clinica e devolve a rota interna de assinatura para o proprio cliente.

```json
{
  "procedureName": "Microagulhamento facial",
  "templateCode": "consentimento-padrao-estetica"
}
```

Resposta sugerida:

```json
{
  "consentRecordId": "uuid",
  "signatureRoute": "/clientes/:id/consentimentos/:consentRecordId/assinar"
}
```

### POST /v1/consent-records/:id/sign

```json
{
  "signatureMethod": "DRAWN",
  "signatureHash": "sha256-da-assinatura",
  "signedAt": "2026-04-09T10:00:00Z",
  "ipAddress": "177.10.10.10",
  "deviceInfo": "Chrome Android"
}
```

### POST /v1/procedures

```json
{
  "clientId": "uuid",
  "professionalId": "uuid",
  "serviceId": "uuid",
  "appointmentId": "uuid",
  "performedAt": "2026-04-09T11:00:00Z",
  "notes": "Sem intercorrencias",
  "productBatchIds": ["uuid-1", "uuid-2"],
  "consentRecordId": "uuid"
}
```

## Insumos

### GET /v1/products
### POST /v1/products
### GET /v1/products/expiring
### POST /v1/products/:id/batches

```json
{
  "batchNumber": "LOT-2026-04",
  "manufacturedAt": "2026-01-01",
  "expiresAt": "2026-07-01",
  "quantity": 12,
  "unit": "un"
}
```

## Residuos

### GET /v1/waste/collectors
### POST /v1/waste/collectors
### GET /v1/waste/pickups
### POST /v1/waste/pickups

```json
{
  "collectorId": "uuid",
  "pickupAt": "2026-04-12T16:30:00Z",
  "wasteClass": "A",
  "weightKg": 8.4,
  "manifestNumber": "MTR-12345"
}
```

## Auditoria e score

### GET /v1/compliance/summary
Retorna score geral, score por categoria e alertas.

### GET /v1/compliance/findings
Lista pendencias com severidade.

### POST /v1/compliance/runs
Dispara recalculo manual.

### GET /v1/compliance/report.pdf
Gera PDF executivo para fiscalizacao.

### GET /v1/audit/logs
Filtros por `entityType`, `entityId`, `userId`, `from`, `to`.
