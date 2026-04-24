const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applyPaidPaymentSideEffects,
  buildPaidClientLockData,
  normalizePaymentData,
} = require('../src/legacy/payments')

test('normalizePaymentData maps explicit fields and delegates paidAt parsing', () => {
  const normalized = normalizePaymentData({
    appointmentId: 12,
    amount: 450,
    method: 'PIX',
    status: 'PAID',
    paidAt: '2026-04-24T10:00:00.000Z',
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    appointmentId: 12,
    amount: 450,
    method: 'PIX',
    status: 'PAID',
    paidAt: 'paidAt:2026-04-24T10:00:00.000Z',
  })
})

test('normalizePaymentData stamps paidAt when status becomes paid', () => {
  const now = new Date('2026-04-24T12:00:00.000Z')
  const normalized = normalizePaymentData({ status: 'PAID' }, value => value, () => now)

  assert.equal(normalized.paidAt, now)
})

test('normalizePaymentData preserves null paidAt when explicitly cleared', () => {
  const normalized = normalizePaymentData({ paidAt: '' }, value => value)
  assert.deepEqual(normalized, { paidAt: null })
})

test('buildPaidClientLockData preserves an existing lock timestamp', () => {
  const lockedAt = new Date('2026-04-20T10:00:00.000Z')
  const paidAt = new Date('2026-04-24T10:00:00.000Z')

  assert.deepEqual(buildPaidClientLockData({
    appointment: { client: { id: 5, lockedAt } },
    record: { paidAt },
  }), {
    isPaid: true,
    isLocked: true,
    lockedAt,
  })
})

test('applyPaidPaymentSideEffects completes appointment and locks client for paid records', async () => {
  const calls = []
  const tx = {
    appointment: {
      async update(args) {
        calls.push(['appointment.update', args])
      },
    },
    client: {
      async update(args) {
        calls.push(['client.update', args])
      },
    },
  }

  const paidAt = new Date('2026-04-24T10:00:00.000Z')

  await applyPaidPaymentSideEffects({
    tx,
    appointment: { client: { id: 9, lockedAt: null } },
    appointmentId: 3,
    record: { status: 'PAID', paidAt },
  })

  assert.deepEqual(calls, [
    ['appointment.update', { where: { id: 3 }, data: { status: 'COMPLETED' } }],
    ['client.update', { where: { id: 9 }, data: { isPaid: true, isLocked: true, lockedAt: paidAt } }],
  ])
})

test('applyPaidPaymentSideEffects ignores non-paid records', async () => {
  const tx = {
    appointment: {
      async update() {
        throw new Error('appointment should not update')
      },
    },
    client: {
      async update() {
        throw new Error('client should not update')
      },
    },
  }

  await assert.doesNotReject(() => applyPaidPaymentSideEffects({
    tx,
    appointment: { client: { id: 9, lockedAt: null } },
    appointmentId: 3,
    record: { status: 'PENDING', paidAt: null },
  }))
})
