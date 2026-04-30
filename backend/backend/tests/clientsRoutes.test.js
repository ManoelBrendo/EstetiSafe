const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { createClientsRouter } = require('../src/api-v2/modules/clients.routes')

function createTestAuth() {
  return {
    authMiddleware(req, _res, next) {
      req.currentUser = {
        id: 10,
        email: 'admin@clinica.test',
        role: 'ADMIN',
        clinicName: 'Clinica Teste',
        ownedClinic: { id: 3, name: 'Clinica Teste' },
      }
      next()
    },
    requireScopedClinicUser(_req, _res, next) {
      next()
    },
    getAuditActor(req) {
      return {
        actorUserId: req.currentUser.id,
        actorEmail: req.currentUser.email,
        actorRole: req.currentUser.role,
      }
    },
  }
}

function createClientFixture(overrides = {}) {
  return {
    id: 1,
    userId: 10,
    name: 'Cliente Protegida',
    email: 'cliente@teste.local',
    phone: '11999999999',
    isPaid: true,
    isLocked: true,
    lockedAt: new Date('2026-04-29T10:00:00.000Z'),
    anamneses: [],
    appointments: [],
    consentRecords: [],
    createdAt: new Date('2026-04-28T10:00:00.000Z'),
    updatedAt: new Date('2026-04-28T10:00:00.000Z'),
    ...overrides,
  }
}

async function createStartedApp(prisma) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/v2/clients', createClientsRouter({ prisma, auth: createTestAuth() }))
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ message: error.message })
  })

  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener))
  })

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

test('PATCH /api/v2/clients/:id blocks locked client updates and audits the attempt', async () => {
  const auditEntries = []
  let updateCalled = false
  const lockedClient = createClientFixture()

  const prisma = {
    client: {
      findFirst: async () => lockedClient,
      update: async () => {
        updateCalled = true
        return lockedClient
      },
    },
    auditLog: {
      create: async entry => {
        auditEntries.push(entry.data)
        return { id: auditEntries.length, ...entry.data }
      },
    },
  }

  const app = await createStartedApp(prisma)

  try {
    const response = await fetch(`${app.url}/api/v2/clients/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '11888888888', photoDataUrl: null }),
    })
    const body = await response.json()

    assert.equal(response.status, 423)
    assert.match(body.message, /bloqueado/)
    assert.equal(updateCalled, false)
    assert.equal(auditEntries.length, 1)
    assert.equal(auditEntries[0].action, 'API_V2_CLIENT_LOCKED_UPDATE_BLOCKED')
    assert.deepEqual(auditEntries[0].metadata.attemptedFields, ['phone', 'photoDataUrl'])
    assert.equal(auditEntries[0].metadata.blockedReason, 'medical_record_locked_after_payment')
  } finally {
    await app.close()
  }
})