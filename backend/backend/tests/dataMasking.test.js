const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { maskCpf, maskPhone } = require('../src/api-v2/lib/dataMasking')
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

function createClientFixture() {
  return {
    id: 1,
    userId: 10,
    name: 'Cliente Protegida',
    email: 'cliente@teste.local',
    phone: '11999999999',
    cpf: '12345678901',
    isPaid: true,
    isLocked: true,
    anamneses: [],
    appointments: [],
    consentRecords: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

async function createStartedApp(prisma) {
  const app = express()
  app.use(express.json())
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

test('dataMasking utility functions', () => {
  assert.equal(maskCpf('12345678901'), '***.***.789-**')
  assert.equal(maskCpf('123.456.789-01'), '***.***.789-**')
  assert.equal(maskCpf('invalid'), '***.***.***-**')
  assert.equal(maskCpf(''), '')

  assert.equal(maskPhone('11999998888'), '(11) 9****-8888')
  assert.equal(maskPhone('(11) 99999-8888'), '(11) 9****-8888')
  assert.equal(maskPhone('1133334444'), '(11) ****-4444')
  assert.equal(maskPhone('invalid'), '(**) *****-****')
  assert.equal(maskPhone(''), '')
})

test('POST /api/v2/clients/:id/reveal reveals sensitive data and logs audit', async () => {
  const auditEntries = []
  const clientFixture = createClientFixture()

  const prisma = {
    client: {
      findFirst: async () => clientFixture,
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
    // 1. Rejeita sem justificativa (reason)
    const failResponse = await fetch(`${app.url}/api/v2/clients/1/reveal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(failResponse.status, 400)

    // 2. Aceita com justificativa válida e registra log
    const successResponse = await fetch(`${app.url}/api/v2/clients/1/reveal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Consulta de CPF para emissão de nota fiscal' }),
    })
    const body = await successResponse.json()

    assert.equal(successResponse.status, 200)
    assert.equal(body.cpf, '12345678901')
    assert.equal(body.phone, '11999999999')
    assert.equal(auditEntries.length, 1)
    assert.equal(auditEntries[0].action, 'API_V2_DATA_REVEAL')
    assert.equal(auditEntries[0].metadata.reason, 'Consulta de CPF para emissão de nota fiscal')
    assert.deepEqual(auditEntries[0].metadata.fields, ['cpf', 'phone'])
  } finally {
    await app.close()
  }
})
