const test = require('node:test')
const assert = require('node:assert/strict')

const {
  backfillMissingServicePops,
  buildServicePop,
  buildServicePopPayload,
  ensureServicePopForService,
  summarizeServicePop,
} = require('../src/legacy/services')

test('buildServicePop generates a readable POP body', () => {
  const content = buildServicePop({
    clinicName: 'Clinica Aurora',
    serviceName: 'Peeling',
    description: 'Protocolo facial regenerador',
    duration: 45,
  })

  assert.match(content, /Clinica: Clinica Aurora/)
  assert.match(content, /Procedimento: Peeling/)
  assert.match(content, /45 minutos/)
  assert.match(content, /Procedimento Operacional Padrao/)
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
