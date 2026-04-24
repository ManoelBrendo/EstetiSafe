const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildAppointmentWhere,
  ensureProfessionalAvailability,
  normalizeAppointmentData,
  shouldSkipAvailabilityCheck,
  validateAppointmentWindow,
} = require('../src/legacy/appointments')

test('shouldSkipAvailabilityCheck only skips cancelled slots', () => {
  assert.equal(shouldSkipAvailabilityCheck('CANCELLED'), true)
  assert.equal(shouldSkipAvailabilityCheck('NO_SHOW'), true)
  assert.equal(shouldSkipAvailabilityCheck('SCHEDULED'), false)
})

test('buildAppointmentWhere resolves range and filters', () => {
  const parseIdCalls = []
  const parseDateTimeCalls = []

  const where = buildAppointmentWhere({
    userId: 9,
    query: {
      from: '2026-04-24T09:00:00.000Z',
      to: '2026-04-24T18:00:00.000Z',
      clientId: '12',
      professionalId: '20',
      status: 'CONFIRMED',
    },
    parseId(value, fieldName) {
      parseIdCalls.push([value, fieldName])
      return Number(value)
    },
    parseDateTime(value, fieldName) {
      parseDateTimeCalls.push([value, fieldName])
      return `${fieldName}:${value}`
    },
  })

  assert.deepEqual(where, {
    userId: 9,
    startAt: {
      gte: 'from:2026-04-24T09:00:00.000Z',
      lte: 'to:2026-04-24T18:00:00.000Z',
    },
    clientId: 12,
    professionalId: 20,
    status: 'CONFIRMED',
  })

  assert.deepEqual(parseIdCalls, [
    ['12', 'clientId'],
    ['20', 'professionalId'],
  ])
  assert.deepEqual(parseDateTimeCalls, [
    ['2026-04-24T09:00:00.000Z', 'from'],
    ['2026-04-24T18:00:00.000Z', 'to'],
  ])
})

test('normalizeAppointmentData trims notes and delegates date parsing', () => {
  const normalized = normalizeAppointmentData({
    clientId: 1,
    serviceId: 2,
    professionalId: 3,
    startAt: '2026-04-24T09:00:00.000Z',
    endAt: '2026-04-24T10:00:00.000Z',
    notes: '  retorno com observacoes  ',
    price: 350,
    status: 'CONFIRMED',
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    clientId: 1,
    serviceId: 2,
    professionalId: 3,
    startAt: 'startAt:2026-04-24T09:00:00.000Z',
    endAt: 'endAt:2026-04-24T10:00:00.000Z',
    notes: 'retorno com observacoes',
    price: 350,
    status: 'CONFIRMED',
  })
})

test('validateAppointmentWindow rejects inverted times', () => {
  assert.throws(() => validateAppointmentWindow({
    appointmentData: {
      startAt: new Date('2026-04-24T10:00:00.000Z'),
      endAt: new Date('2026-04-24T09:00:00.000Z'),
    },
    httpError(status, message) {
      const error = new Error(message)
      error.status = status
      return error
    },
  }), /horario final/)
})

test('ensureProfessionalAvailability rejects overlapping active appointments', async () => {
  await assert.rejects(() => ensureProfessionalAvailability({
    prisma: {
      appointment: {
        async findFirst() {
          return { id: 77 }
        },
      },
    },
    httpError(status, message) {
      const error = new Error(message)
      error.status = status
      return error
    },
    userId: 1,
    professionalId: 2,
    startAt: new Date('2026-04-24T09:00:00.000Z'),
    endAt: new Date('2026-04-24T10:00:00.000Z'),
  }), /ja possui atendimento/)
})

test('ensureProfessionalAvailability allows open slots', async () => {
  await assert.doesNotReject(() => ensureProfessionalAvailability({
    prisma: {
      appointment: {
        async findFirst() {
          return null
        },
      },
    },
    httpError(status, message) {
      const error = new Error(message)
      error.status = status
      return error
    },
    userId: 1,
    professionalId: 2,
    startAt: new Date('2026-04-24T09:00:00.000Z'),
    endAt: new Date('2026-04-24T10:00:00.000Z'),
  }))
})
