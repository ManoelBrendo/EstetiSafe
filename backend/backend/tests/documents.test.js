const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  buildDocumentDashboard,
  getDocumentStatus,
  normalizeDocumentData,
  registerDocumentRoutes,
  summarizeDocument,
} = require('../src/legacy/documents')


function createDocumentRouteHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    ownedClinic: { id: 14 },
  }
  const baseDocument = {
    id: 321,
    userId: currentUser.id,
    category: 'LEGAL',
    documentType: 'Alvará sanitário',
    title: 'Alvará sanitário 2026',
    notes: null,
    expiresAt: '2026-05-20T00:00:00.000Z',
    fileName: 'alvara.pdf',
    fileMimeType: 'application/pdf',
    fileDataUrl: 'data:application/pdf;base64,abc',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
  }
  const calls = {
    findManyWhere: [],
    findWhere: [],
    createData: [],
    updateData: [],
    deleteWhere: [],
    audit: [],
  }
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  registerDocumentRoutes({
    app,
    prisma: {
      clinicDocument: {
        findMany: async ({ where }) => {
          calls.findManyWhere.push(where)
          return [baseDocument]
        },
        findFirstOrThrow: async ({ where }) => {
          calls.findWhere.push(where)
          return { ...baseDocument, id: where.id, userId: where.userId }
        },
        create: async ({ data }) => {
          calls.createData.push(data)
          return { ...baseDocument, ...data, id: 654 }
        },
        update: async ({ where, data }) => {
          calls.updateData.push(data)
          return { ...baseDocument, id: where.id, ...data }
        },
        deleteMany: async ({ where }) => {
          calls.deleteWhere.push(where)
          return { count: 1 }
        },
      },
    },
    authMiddleware: (req, _res, next) => {
      req.currentUser = currentUser
      req.user = { id: 999 }
      next()
    },
    handle: fn => async (req, res, next) => {
      try {
        await fn(req, res, next)
      } catch (error) {
        next(error)
      }
    },
    parseId: value => Number(value),
    parseDateOnly: value => new Date(`${value}T00:00:00.000Z`),
    createAuditLogFromRequest: async (_req, payload) => {
      calls.audit.push(payload)
      return payload
    },
  })

  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message })
  })

  const server = app.listen(0)
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    calls,
    request: (path, options = {}) => fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  }
}
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
test('document routes use current user scope and write audit trail', async t => {
  const harness = createDocumentRouteHarness()
  t.after(() => harness.close())

  const listResponse = await harness.request('/documents')
  assert.equal(listResponse.status, 200)
  assert.equal(harness.calls.findManyWhere.at(-1).userId, 77)

  const createResponse = await harness.request('/documents', {
    method: 'POST',
    body: JSON.stringify({
      category: 'LEGAL',
      documentType: 'Alvará sanitário',
      title: 'Alvará sanitário atualizado',
      expiresAt: '2026-05-20',
      fileName: 'alvara.pdf',
      fileMimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,abc',
    }),
  })
  assert.equal(createResponse.status, 201)
  assert.equal(harness.calls.createData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_DOCUMENT_CREATE')

  const viewResponse = await harness.request('/documents/321')
  assert.equal(viewResponse.status, 200)
  assert.deepEqual(harness.calls.findWhere.at(-1), { id: 321, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_DOCUMENT_VIEW')

  const updateResponse = await harness.request('/documents/321', {
    method: 'PUT',
    body: JSON.stringify({ title: 'Alvará revisado' }),
  })
  assert.equal(updateResponse.status, 200)
  assert.deepEqual(harness.calls.findWhere.at(-1), { id: 321, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_DOCUMENT_UPDATE')

  const deleteResponse = await harness.request('/documents/321', { method: 'DELETE' })
  assert.equal(deleteResponse.status, 200)
  assert.deepEqual(harness.calls.deleteWhere.at(-1), { id: 321, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_DOCUMENT_DELETE')
})