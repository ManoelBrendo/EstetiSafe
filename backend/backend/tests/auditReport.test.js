const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  buildAuditReportSnapshot,
  registerAuditReportRoutes,
} = require('../src/legacy/auditReport')

function createFakePdfDoc() {
  const calls = []
  const doc = {
    calls,
    page: {
      width: 595,
      height: 842,
      margins: { left: 50, right: 50, top: 50, bottom: 50 },
    },
  }

  const chainable = [
    'addPage',
    'fillColor',
    'fontSize',
    'text',
    'moveDown',
    'rect',
    'roundedRect',
    'stroke',
    'fill',
    'save',
    'restore',
    'lineWidth',
  ]

  chainable.forEach(method => {
    doc[method] = (...args) => {
      calls.push([method, ...args])
      return doc
    }
  })

  return doc
}

function createAuditReportHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    clinicName: 'Clínica Áurea',
    ownedClinic: { id: 14 },
    clinicOperationalScopes: ['LASER'],
  }
  const calls = {
    documentWhere: [],
    correctiveWhere: [],
    auditWhere: [],
    audit: [],
    pdfFilename: null,
    pdfCalls: [],
  }
  const app = express()

  registerAuditReportRoutes({
    app,
    prisma: {
      clinicDocument: {
        findMany: async ({ where }) => {
          calls.documentWhere.push(where)
          return [
            {
              id: 1,
              category: 'LEGAL',
              documentType: 'Alvará sanitário',
              title: 'Alvará sanitário 2026',
              expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              fileName: 'alvara.pdf',
              fileMimeType: 'application/pdf',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-05-01T00:00:00.000Z',
            },
          ]
        },
      },
      auditCorrectiveAction: {
        findMany: async ({ where }) => {
          calls.correctiveWhere.push(where)
          return [
            {
              id: 10,
              taskKey: 'documents-0',
              domainId: 'documents',
              domainTitle: 'Documentos',
              title: 'Atualizar alvará sanitário',
              owner: 'Administrativo',
              dueLabel: '48h',
              dueAt: null,
              evidence: 'Documento próximo do vencimento.',
              status: 'OPEN',
              riskLevel: 'CRITICAL',
              actionUrl: '/documentos',
              updatedAt: '2026-05-02T00:00:00.000Z',
              attachments: [{ id: 99, fileName: 'protocolo.pdf' }],
            },
          ]
        },
      },
      auditLog: {
        findMany: async ({ where }) => {
          calls.auditWhere.push(where)
          return [
            {
              id: 'log-1',
              action: 'DOCUMENT_DOWNLOAD',
              entityType: 'ClinicDocument',
              actorEmail: 'clinica@example.com',
              actorRole: 'ADMIN',
              createdAt: '2026-05-03T00:00:00.000Z',
            },
          ]
        },
      },
    },
    authMiddleware: (req, _res, next) => {
      req.currentUser = currentUser
      req.user = { id: currentUser.id, email: currentUser.email, role: 'ADMIN' }
      next()
    },
    handle: fn => async (req, res, next) => {
      try {
        await fn(req, res, next)
      } catch (error) {
        next(error)
      }
    },
    sendPdfDocument: (res, filename, renderDocument) => {
      const doc = createFakePdfDoc()
      calls.pdfFilename = filename
      renderDocument(doc)
      calls.pdfCalls = doc.calls
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.end(Buffer.from('%PDF fake'))
    },
    sanitizeFileName: value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(),
    getRequestClinicId: req => req.currentUser.ownedClinic.id,
    getScopedUserId: req => req.currentUser.id,
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
    request: (path, options = {}) => fetch(`${baseUrl}${path}`, options),
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

test('buildAuditReportSnapshot summarizes documents, actions, and audit trail', () => {
  const snapshot = buildAuditReportSnapshot({
    clinicName: 'Clínica Áurea',
    documents: [
      {
        id: 1,
        category: 'LEGAL',
        documentType: 'Alvará sanitário',
        title: 'Alvará sanitário',
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
    correctiveActions: [
      {
        title: 'Atualizar alvará sanitário',
        owner: 'Administrativo',
        dueLabel: '48h',
        evidence: 'Documento próximo do vencimento.',
        status: 'OPEN',
        riskLevel: 'CRITICAL',
        attachments: [{ id: 1 }],
      },
    ],
    auditLogs: [{ id: 'log-1' }],
    generatedAt: '2026-06-01T12:00:00.000Z',
  })

  assert.equal(snapshot.clinicName, 'Clínica Áurea')
  assert.equal(snapshot.documentScore, 0)
  assert.equal(snapshot.openActionCount, 1)
  assert.equal(snapshot.criticalActionCount, 1)
  assert.equal(snapshot.attachmentCount, 1)
  assert.equal(snapshot.traceabilityEventCount, 1)
  assert.match(snapshot.executiveStatus, /Ação prioritária/)
  assert.equal(snapshot.priorityActions[0].title, 'Atualizar alvará sanitário')
})

test('audit report route downloads a scoped PDF and writes audit log', async () => {
  const harness = createAuditReportHarness()

  try {
    const response = await harness.request('/audit/report.pdf')
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    assert.match(response.headers.get('content-disposition'), /relatorio-auditoria-clinica-aurea\.pdf/)
    assert.equal(body, '%PDF fake')
    assert.deepEqual(harness.calls.documentWhere[0], { userId: 77 })
    assert.deepEqual(harness.calls.correctiveWhere[0], { userId: 77 })
    assert.equal(harness.calls.audit[0].action, 'AUDIT_REPORT_PDF_DOWNLOAD')
    assert.equal(harness.calls.audit[0].clinicId, 14)
    assert.equal(harness.calls.audit[0].metadata.filename, 'relatorio-auditoria-clinica-aurea.pdf')
    assert.ok(harness.calls.pdfCalls.some(call => call[0] === 'text' && String(call[1]).includes('Clínica Áurea')))
  } finally {
    await harness.close()
  }
})
