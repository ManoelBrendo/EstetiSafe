const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildDocumentDashboard,
  getDocumentStatus,
  normalizeDocumentData,
  summarizeDocument,
} = require('../src/legacy/documents')

function isoDateFromOffset(daysOffset) {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return date.toISOString()
}

test('getDocumentStatus classifies expiry windows correctly', () => {
  assert.deepEqual(getDocumentStatus(null), {
    status: 'WITHOUT_EXPIRY',
    label: 'Sem vencimento',
    daysUntilExpiry: null,
  })

  assert.equal(getDocumentStatus(isoDateFromOffset(45)).status, 'VALID')
  assert.equal(getDocumentStatus(isoDateFromOffset(5)).status, 'EXPIRING')
  assert.equal(getDocumentStatus(isoDateFromOffset(-2)).status, 'EXPIRED')
})

test('summarizeDocument preserves record fields and computed status', () => {
  const summarized = summarizeDocument({
    id: 42,
    category: 'LEGAL',
    documentType: 'Alvara sanitario',
    title: 'Alvara sanitario 2026',
    notes: 'Documento principal',
    expiresAt: isoDateFromOffset(10),
    fileName: 'alvara.pdf',
    fileMimeType: 'application/pdf',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-20T10:00:00.000Z',
  })

  assert.equal(summarized.id, 42)
  assert.equal(summarized.status, 'EXPIRING')
  assert.match(summarized.statusLabel, /Vence em/)
})

test('buildDocumentDashboard computes coverage, missing requirements, and alerts', () => {
  const records = [
    {
      id: 1,
      category: 'LEGAL',
      documentType: 'Alvara sanitario',
      title: 'Alvara sanitario atualizado',
      notes: null,
      expiresAt: isoDateFromOffset(6),
      fileName: 'alvara-sanitario.pdf',
      fileMimeType: 'application/pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-11T00:00:00.000Z',
    },
    {
      id: 2,
      category: 'CLIENTS',
      documentType: 'Termo de consentimento padrao',
      title: 'Termo padrao da clinica',
      notes: null,
      expiresAt: null,
      fileName: 'termo.pdf',
      fileMimeType: 'application/pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
  ]

  const dashboard = buildDocumentDashboard(records)

  assert.equal(dashboard.total, 2)
  assert.equal(dashboard.expiring, 1)
  assert.ok(dashboard.missingCount > 0)
  assert.ok(Array.isArray(dashboard.categories))
  assert.ok(dashboard.categories.some(category => category.category === 'LEGAL'))
  assert.ok(dashboard.alerts.length >= 1)
})

test('normalizeDocumentData trims values and delegates date parsing', () => {
  const normalized = normalizeDocumentData({
    category: 'LEGAL',
    documentType: '  Alvara  ',
    title: '  Documento base ',
    notes: '  observacao  ',
    expiresAt: '2026-05-02',
    fileName: '  arquivo.pdf ',
    fileMimeType: ' application/pdf ',
    fileDataUrl: 'data:application/pdf;base64,abc',
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    category: 'LEGAL',
    documentType: 'Alvara',
    title: 'Documento base',
    notes: 'observacao',
    expiresAt: 'expiresAt:2026-05-02',
    fileName: 'arquivo.pdf',
    fileMimeType: 'application/pdf',
    fileDataUrl: 'data:application/pdf;base64,abc',
  })
})