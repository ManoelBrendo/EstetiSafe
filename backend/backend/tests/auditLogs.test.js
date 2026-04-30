const test = require('node:test')
const assert = require('node:assert/strict')

const {
  classifyAuditAction,
  serializeAuditLog,
  buildAuditLogSummary,
  describeAuditLog,
} = require('../src/api-v2/lib/audit-logs')
const { buildSearchFilter } = require('../src/api-v2/modules/audit-logs.routes')

test('classifyAuditAction identifies high risk medical record PDF downloads', () => {
  const meta = classifyAuditAction('API_V2_MEDICAL_RECORD_PDF_DOWNLOAD')

  assert.equal(meta.label, 'PDF de prontuário baixado')
  assert.equal(meta.category, 'Prontuario')
  assert.equal(meta.severity, 'HIGH')
})

test('serializeAuditLog adds readable metadata to raw audit logs', () => {
  const serialized = serializeAuditLog({
    id: 7,
    clinicId: 2,
    actorUserId: 1,
    actorEmail: 'clinica@demo.com',
    actorRole: 'ADMIN',
    action: 'CONSENT_RECORD_IMAGE_USE_GENERATE',
    entityType: 'ConsentRecord',
    entityId: '9',
    metadata: { clientName: 'Ana Cliente' },
    createdAt: new Date('2026-04-28T10:00:00.000Z'),
  })

  assert.equal(serialized.actionLabel, 'Termo de imagem gerado')
  assert.equal(serialized.category, 'Consentimento')
  assert.equal(serialized.severity, 'HIGH')
  assert.equal(serialized.description, 'Termo de imagem gerado vinculado a Ana Cliente.')
})

test('buildAuditLogSummary groups actions by category and risk', () => {
  const summary = buildAuditLogSummary([
    { action: 'CONSENT_RECORD_SIGN', _count: { _all: 2 } },
    { action: 'API_V2_CLIENT_CREATE', _count: { _all: 3 } },
    { action: 'API_V2_PAYMENT_UPDATE', _count: { _all: 1 } },
  ], 6)

  assert.equal(summary.total, 6)
  assert.equal(summary.highRiskCount, 2)
  assert.deepEqual(summary.byCategory, [
    { category: 'Clientes', count: 3 },
    { category: 'Consentimento', count: 2 },
    { category: 'Financeiro', count: 1 },
  ])
})

test('describeAuditLog falls back to route path when entity context is not available', () => {
  const description = describeAuditLog({
    action: 'BILLING_GATEWAY_WEBHOOK_RECEIVED',
    metadata: { path: '/billing/gateway/webhook' },
  })

  assert.equal(description, 'Webhook financeiro recebido pela rota /billing/gateway/webhook.')
})

test('buildSearchFilter maps Portuguese search terms to technical audit actions', () => {
  const filter = buildSearchFilter('suporte')

  assert.ok(filter.OR.some(item => item.actorRole === 'SUPPORT'))
  assert.ok(filter.OR.some(item => item.action?.contains === 'SUPPORT'))
})
test('describeAuditLog includes intercurrence clinical context', () => {
  const description = describeAuditLog({
    action: 'INTERCURRENCE_CREATE',
    metadata: {
      clientName: 'Ana Cliente',
      procedureName: 'Laser facial',
      professionalName: 'Dra. Helena',
    },
  })

  assert.equal(description, 'Intercorrência registrada: Laser facial para Ana Cliente com Dra. Helena.')
})
test('describeAuditLog includes operational inventory context', () => {
  const description = describeAuditLog({
    action: 'INVENTORY_PRODUCT_CREATE',
    metadata: {
      name: 'Sérum clareador',
      assetType: 'PRODUCT',
    },
  })

  assert.equal(description, 'Produto cadastrado: Sérum clareador.')
})