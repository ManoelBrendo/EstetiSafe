const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { z } = require('zod')

const {
  backfillMissingServicePops,
  buildServicePop,
  buildServicePopPayload,
  ensureServicePopForService,
  getScopedServiceUserId,
  registerServiceRoutes,
  summarizeServicePop,
} = require('../src/legacy/services')


function createServiceRouteHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    clinicName: 'Clínica Aurora',
    ownedClinic: { id: 14 },
  }
  const baseService = {
    id: 301,
    userId: currentUser.id,
    name: 'Limpeza de pele premium',
    description: 'Higienização e extração com protocolo premium',
    duration: 60,
    price: 180,
    active: true,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    servicePop: {
      id: 401,
      title: 'POP - Limpeza de pele premium',
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      content: 'POP pronto',
    },
  }
  const calls = {
    findManyWhere: [],
    createData: [],
    updateManyWhere: [],
    userWhere: [],
    audit: [],
  }
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  registerServiceRoutes({
    app,
    prisma: {
      user: {
        findUniqueOrThrow: async ({ where }) => {
          calls.userWhere.push(where)
          return { clinicName: currentUser.clinicName }
        },
      },
      service: {
        findMany: async ({ where }) => {
          calls.findManyWhere.push(where)
          return [baseService]
        },
        findFirstOrThrow: async ({ where }) => ({ ...baseService, id: where.id, userId: where.userId }),
        updateMany: async ({ where }) => {
          calls.updateManyWhere.push(where)
          return { count: 1 }
        },
      },
      async $transaction(callbackOrPromises) {
        if (typeof callbackOrPromises === 'function') {
          return callbackOrPromises({
            service: {
              create: async ({ data }) => {
                calls.createData.push(data)
                return { ...baseService, ...data, id: 701, servicePop: null }
              },
            },
            servicePop: {
              create: async ({ data }) => ({ id: 801, title: data.title, updatedAt: new Date('2026-04-03T00:00:00.000Z'), content: data.content }),
              upsert: async ({ create }) => ({ id: 802, title: create.title, updatedAt: new Date('2026-04-03T00:00:00.000Z'), content: create.content }),
            },
          })
        }

        return Promise.all(callbackOrPromises)
      },
      servicePop: {
        upsert: async ({ create }) => ({ id: 803, title: create.title, updatedAt: new Date('2026-04-03T00:00:00.000Z'), content: create.content }),
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
    serviceSchema: z.object({
      name: z.string().trim().min(2),
      description: z.string().trim().optional(),
      duration: z.number().int().min(5),
      price: z.number().min(0),
      active: z.boolean().optional(),
    }),
    normalizeServiceData: data => ({
      name: data.name?.trim(),
      description: data.description?.trim() || null,
      duration: data.duration,
      price: data.price,
      active: data.active ?? true,
    }),
    sanitizeFileName: value => String(value || 'pop').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    sendPdfDocument: () => null,
    renderServicePopPdf: () => null,
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
test('buildServicePop generates a readable POP body', () => {
  const content = buildServicePop({
    clinicName: 'Clinica Aurora',
    serviceName: 'Peeling',
    description: 'Protocolo facial regenerador',
    duration: 45,
  })

  assert.match(content, /Clínica: Clinica Aurora/)
  assert.match(content, /Procedimento: Peeling/)
  assert.match(content, /45 minutos/)
  assert.match(content, /Procedimento Operacional Padrão/)
})

test('buildServicePopPayload binds service identity and content', () => {
  const payload = buildServicePopPayload({
    userId: 4,
    clinicName: 'Clinica Aurora',
    service: { id: 8, name: 'Limpeza de pele', description: 'Atendimento', duration: 60 },
  })

  assert.equal(payload.userId, 4)
  assert.equal(payload.serviceId, 8)
  assert.equal(payload.title, 'POP - Limpeza de pele')
  assert.match(payload.content, /Limpeza de pele/)
})

test('summarizeServicePop builds download metadata', () => {
  const summary = summarizeServicePop({
    id: 7,
    title: 'POP - Radiofrequencia Facial',
    updatedAt: '2026-04-24T10:00:00.000Z',
  })

  assert.deepEqual(summary, {
    id: 7,
    title: 'POP - Radiofrequencia Facial',
    updatedAt: '2026-04-24T10:00:00.000Z',
    downloadName: 'pop-radiofrequencia-facial.txt',
  })
})

test('backfillMissingServicePops returns false when nothing is missing', async () => {
  const result = await backfillMissingServicePops({
    prisma: {
      $transaction() {
        throw new Error('should not run transaction')
      },
    },
    userId: 1,
    clinicName: 'Clinica Aurora',
    services: [{ id: 10, servicePop: { id: 11 } }],
  })

  assert.equal(result, false)
})

test('backfillMissingServicePops creates POPs only for missing services', async () => {
  const upsertCalls = []

  const prisma = {
    servicePop: {
      upsert(args) {
        upsertCalls.push(args)
        return args
      },
    },
    async $transaction(promises) {
      return Promise.all(promises)
    },
  }

  const result = await backfillMissingServicePops({
    prisma,
    userId: 3,
    clinicName: 'Clinica Aurora',
    services: [
      { id: 1, name: 'Microagulhamento', description: 'Bioestimulacao', duration: 50, servicePop: null },
      { id: 2, name: 'Limpeza de pele', description: 'Rotina', duration: 60, servicePop: { id: 22 } },
      { id: 3, name: 'Peeling', description: 'Acidos', duration: 30, servicePop: null },
    ],
  })

  assert.equal(result, true)
  assert.equal(upsertCalls.length, 2)
  assert.deepEqual(upsertCalls.map(call => call.where.serviceId), [1, 3])
})

test('ensureServicePopForService reuses existing POPs before hitting prisma', async () => {
  const pop = { id: 99, title: 'POP - Peeling' }

  const result = await ensureServicePopForService({
    prisma: {
      servicePop: {
        upsert() {
          throw new Error('should not upsert')
        },
      },
    },
    userId: 2,
    clinicName: 'Clinica Aurora',
    service: { id: 3, servicePop: pop },
  })

  assert.equal(result, pop)
})

test('ensureServicePopForService creates POP when missing', async () => {
  const calls = []
  const prisma = {
    servicePop: {
      async upsert(args) {
        calls.push(args)
        return { id: 12, title: 'POP - Peeling', content: args.create.content }
      },
    },
  }

  const result = await ensureServicePopForService({
    prisma,
    userId: 2,
    clinicName: 'Clinica Aurora',
    service: { id: 3, name: 'Peeling', description: 'Acidos', duration: 30, servicePop: null },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].where.serviceId, 3)
  assert.equal(result.id, 12)
})
test('getScopedServiceUserId prefers currentUser over legacy user', () => {
  assert.equal(getScopedServiceUserId({ currentUser: { id: 77 }, user: { id: 999 } }), 77)
  assert.equal(getScopedServiceUserId({ user: { id: 999 } }), 999)
})

test('service routes use current user scope and write audit trail', async t => {
  const harness = createServiceRouteHarness()
  t.after(() => harness.close())

  const listResponse = await harness.request('/services')
  assert.equal(listResponse.status, 200)
  assert.equal(harness.calls.findManyWhere.at(-1).userId, 77)

  const createResponse = await harness.request('/services', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Limpeza de pele premium',
      description: 'Higienização e extração com protocolo premium',
      duration: 60,
      price: 180,
      active: true,
    }),
  })
  assert.equal(createResponse.status, 201)
  assert.equal(harness.calls.userWhere.at(-1).id, 77)
  assert.equal(harness.calls.createData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).action, 'SERVICE_CREATE')

  const deleteResponse = await harness.request('/services/301', { method: 'DELETE' })
  assert.equal(deleteResponse.status, 200)
  assert.deepEqual(harness.calls.updateManyWhere.at(-1), { id: 301, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'SERVICE_ARCHIVE')
})