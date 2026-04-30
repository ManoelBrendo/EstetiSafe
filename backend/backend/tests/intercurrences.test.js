const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  buildIntercurrenceWhere,
  getScopedIntercurrenceUserId,
  registerIntercurrenceRoutes,
} = require('../src/legacy/intercurrences')

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function createIntercurrenceRouteHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    ownedClinic: { id: 14 },
  }
  const baseIntercurrence = {
    id: 600,
    userId: currentUser.id,
    clientId: 123,
    serviceId: null,
    professionalId: null,
    procedureName: 'Laser facial',
    occurredAt: new Date('2026-04-28T14:30:00.000Z'),
    description: 'Cliente relatou ardor persistente apos o procedimento.',
    conduct: 'Aplicada compressa fria e orientado retorno.',
    notes: null,
    professionalName: 'Dra. Helena',
    createdByUserId: currentUser.id,
    createdByEmail: currentUser.email,
    createdAt: new Date('2026-04-28T15:00:00.000Z'),
    updatedAt: new Date('2026-04-28T15:00:00.000Z'),
    client: { id: 123, name: 'Cliente Atual', phone: '11999999999' },
    service: null,
    professional: null,
    _count: { edits: 0 },
  }
  const calls = {
    findManyWhere: [],
    countWhere: [],
    findWhere: [],
    clientWhere: [],
    createData: [],
    audit: [],
  }
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  registerIntercurrenceRoutes({
    app,
    prisma: {
      client: {
        findFirstOrThrow: async ({ where }) => {
          calls.clientWhere.push(where)
          return { id: where.id, name: 'Cliente Atual' }
        },
      },
      service: {
        findFirstOrThrow: async ({ where }) => ({ id: where.id, name: 'Servico teste' }),
      },
      professional: {
        findFirstOrThrow: async ({ where }) => ({ id: where.id, name: 'Profissional teste', specialty: 'Estetica' }),
      },
      clinicalIntercurrence: {
        findMany: async ({ where }) => {
          calls.findManyWhere.push(where)
          return [baseIntercurrence]
        },
        count: async ({ where }) => {
          calls.countWhere.push(where)
          return 1
        },
        findFirstOrThrow: async ({ where }) => {
          calls.findWhere.push(where)
          return { ...baseIntercurrence, id: where.id, userId: where.userId }
        },
        create: async ({ data }) => {
          calls.createData.push(data)
          return { ...baseIntercurrence, ...data, id: 601, client: baseIntercurrence.client, _count: { edits: 0 } }
        },
      },
    },
    authMiddleware: (req, _res, next) => {
      req.currentUser = currentUser
      req.user = { id: 999, email: 'legacy@example.com' }
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
    httpError,
    getAuditActorData: req => ({ actorUserId: req.currentUser.id, actorEmail: req.currentUser.email }),
    createAuditLogFromRequest: async (_req, payload) => {
      calls.audit.push(payload)
      return payload
    },
    getRequestClinicId: req => req.currentUser.ownedClinic.id,
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

test('getScopedIntercurrenceUserId prefers currentUser over legacy user', () => {
  assert.equal(getScopedIntercurrenceUserId({ currentUser: { id: 77 }, user: { id: 999 } }), 77)
  assert.equal(getScopedIntercurrenceUserId({ user: { id: 999 } }), 999)
})

test('buildIntercurrenceWhere uses the scoped user id and keeps search filters', () => {
  const where = buildIntercurrenceWhere({
    req: {
      currentUser: { id: 77 },
      user: { id: 999 },
      query: { search: 'laser', clientId: '123' },
    },
    parseId: value => Number(value),
  })

  assert.equal(where.userId, 77)
  assert.equal(where.clientId, 123)
  assert.ok(Array.isArray(where.OR))
})

test('intercurrence routes use current user scope and write audit trail', async t => {
  const harness = createIntercurrenceRouteHarness()
  t.after(() => harness.close())

  const listResponse = await harness.request('/intercurrences?search=laser')
  assert.equal(listResponse.status, 200)
  assert.equal(harness.calls.findManyWhere.at(-1).userId, 77)
  assert.equal(harness.calls.countWhere.at(-1).userId, 77)

  const viewResponse = await harness.request('/intercurrences/600')
  assert.equal(viewResponse.status, 200)
  assert.deepEqual(harness.calls.findWhere.at(-1), { id: 600, userId: 77 })

  const createResponse = await harness.request('/intercurrences', {
    method: 'POST',
    body: JSON.stringify({
      clientId: 123,
      procedureName: 'Laser facial',
      occurredDate: '2026-04-28',
      occurredTime: '14:30',
      description: 'Cliente relatou ardor persistente apos o procedimento.',
      conduct: 'Aplicada compressa fria e orientado retorno.',
      professionalName: 'Dra. Helena',
    }),
  })

  assert.equal(createResponse.status, 201)
  assert.equal(harness.calls.clientWhere.at(-1).userId, 77)
  assert.equal(harness.calls.createData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).clinicId, 14)
  assert.equal(harness.calls.audit.at(-1).action, 'INTERCURRENCE_CREATE')
})