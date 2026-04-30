const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  buildClinicBillsDashboard,
  getBillDueStatus,
  normalizeClinicBillData,
  registerBillingRoutes,
  summarizeClinicBill,
  toSafeNumber,
} = require('../src/legacy/billing')


function createBillingRouteHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    clinicName: 'Clinica Teste',
    createdAt: '2026-04-01T00:00:00.000Z',
    billingStatus: 'ACTIVE',
    ownedClinic: {
      id: 12,
      subscription: null,
    },
  }
  const baseRecord = {
    id: 123,
    userId: currentUser.id,
    title: 'Conta operacional',
    category: 'Operacional',
    amount: 120,
    dueAt: '2026-05-10T00:00:00.000Z',
    paidAt: null,
    notes: null,
    active: true,
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
  }
  const calls = {
    createData: [],
    findWhere: [],
    updateData: [],
    updateManyWhere: [],
    audit: [],
  }
  const app = express()

  app.use(express.json())

  registerBillingRoutes({
    app,
    prisma: {
      clinicBill: {
        findMany: async () => [],
        create: async ({ data }) => {
          calls.createData.push(data)
          return {
            ...baseRecord,
            ...data,
            id: 456,
          }
        },
        findFirstOrThrow: async ({ where }) => {
          calls.findWhere.push(where)
          return {
            ...baseRecord,
            id: where.id,
            userId: where.userId,
          }
        },
        update: async ({ where, data }) => {
          calls.updateData.push(data)
          return {
            ...baseRecord,
            id: where.id,
            ...data,
          }
        },
        updateMany: async ({ where, data }) => {
          calls.updateManyWhere.push(where)
          calls.updateData.push(data)
          return { count: 1 }
        },
      },
      auditLog: {
        findMany: async () => [],
      },
      user: {
        update: async () => currentUser,
      },
      clinic: {
        update: async () => currentUser.ownedClinic,
      },
      $transaction: async operations => Promise.all(operations),
    },
    authMiddleware: (req, _res, next) => {
      req.currentUser = currentUser
      req.user = { id: 999 }
      next()
    },
    requireSupportBillingControl: (_req, _res, next) => next(),
    handle: fn => async (req, res, next) => {
      try {
        await fn(req, res, next)
      } catch (error) {
        next(error)
      }
    },
    parseId: value => Number(value),
    parseDateOnly: value => new Date(`${value}T00:00:00.000Z`),
    ensureClinicAggregate: async () => currentUser,
    getBillingSnapshot: () => ({ status: 'ACTIVE', effectiveStatus: 'ACTIVE', blocked: false }),
    mapBillingStatusToClinicStatus: () => 'ACTIVE',
    createAuditLogFromRequest: async (_req, payload) => {
      calls.audit.push(payload)
      return payload
    },
    serializeAuditLog: log => log,
    addDays: date => new Date(date),
    supportAdminName: 'Suporte',
    supportAdminEmail: 'suporte@example.com',
    canManageSubscription: () => false,
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

test('getBillDueStatus classifies due windows correctly', () => {
  assert.deepEqual(getBillDueStatus(null), {
    status: 'WITHOUT_DATE',
    label: 'Sem data informada',
    daysUntilDue: null,
  })

  assert.equal(getBillDueStatus(isoDateFromOffset(45)).status, 'OK')
  assert.equal(getBillDueStatus(isoDateFromOffset(5)).status, 'WARNING')
  assert.equal(getBillDueStatus(isoDateFromOffset(-2)).status, 'OVERDUE')
})

test('summarizeClinicBill preserves fields and computes payment status', () => {
  const pending = summarizeClinicBill({
    id: 5,
    title: 'Aluguel da sala',
    category: 'Operacional',
    amount: 850,
    dueAt: isoDateFromOffset(3),
    paidAt: null,
    notes: 'Abril',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
  })

  const paid = summarizeClinicBill({
    ...pending,
    paidAt: '2026-04-12T00:00:00.000Z',
  })

  assert.equal(pending.status, 'PENDING')
  assert.equal(pending.statusLabel, 'Em dia')
  assert.equal(paid.status, 'PAID')
  assert.equal(paid.statusLabel, 'Pago')
})

test('buildClinicBillsDashboard computes totals and amounts', () => {
  const records = [
    {
      id: 1,
      title: 'Conta em atraso',
      category: 'Fixo',
      amount: 100,
      dueAt: isoDateFromOffset(-3),
      paidAt: null,
      notes: null,
      active: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 2,
      title: 'Conta pendente',
      category: 'Fixo',
      amount: 50,
      dueAt: isoDateFromOffset(10),
      paidAt: null,
      notes: null,
      active: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 3,
      title: 'Conta paga',
      category: 'Fixo',
      amount: 80,
      dueAt: isoDateFromOffset(-10),
      paidAt: new Date().toISOString(),
      notes: null,
      active: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ]

  const dashboard = buildClinicBillsDashboard(records)

  assert.equal(dashboard.openCount, 2)
  assert.equal(dashboard.overdueCount, 1)
  assert.equal(dashboard.paidCount, 1)
  assert.equal(dashboard.totalOpenAmount, 150)
  assert.equal(dashboard.overdueAmount, 100)
  assert.ok(Array.isArray(dashboard.bills))
})

test('normalizeClinicBillData trims values and delegates date parsing', () => {
  const normalized = normalizeClinicBillData({
    title: '  Conta principal  ',
    category: '  Operacional ',
    amount: 299.9,
    dueAt: '2026-05-01',
    paidAt: '2026-05-02',
    notes: '  observacao interna  ',
    active: true,
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    title: 'Conta principal',
    category: 'Operacional',
    amount: 299.9,
    dueAt: 'dueAt:2026-05-01',
    paidAt: 'paidAt:2026-05-02',
    notes: 'observacao interna',
    active: true,
  })
})

test('toSafeNumber returns rounded numbers and safe fallback', () => {
  assert.equal(toSafeNumber('199.999'), 200)
  assert.equal(toSafeNumber('abc', 15), 15)
})

test('billing bill routes use current user scope and write audit trail', async t => {
  const harness = createBillingRouteHarness()
  t.after(() => harness.close())

  const createResponse = await harness.request('/billing/bills', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Conta nova',
      category: 'Operacional',
      amount: 199.9,
      dueAt: '2026-05-10',
    }),
  })
  assert.equal(createResponse.status, 201)
  assert.equal(harness.calls.createData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_BILL_CREATE')

  const updateResponse = await harness.request('/billing/bills/123', {
    method: 'PUT',
    body: JSON.stringify({
      title: 'Conta ajustada',
      amount: 220,
      dueAt: '2026-05-12',
    }),
  })
  assert.equal(updateResponse.status, 200)
  assert.deepEqual(harness.calls.findWhere.at(-1), { id: 123, userId: 77, active: true })
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_BILL_UPDATE')

  const paidResponse = await harness.request('/billing/bills/123/mark-paid', { method: 'POST' })
  assert.equal(paidResponse.status, 200)
  assert.deepEqual(harness.calls.findWhere.at(-1), { id: 123, userId: 77, active: true })
  assert.ok(harness.calls.updateData.at(-1).paidAt instanceof Date)
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_BILL_MARK_PAID')

  const deleteResponse = await harness.request('/billing/bills/123', { method: 'DELETE' })
  assert.equal(deleteResponse.status, 200)
  assert.deepEqual(harness.calls.updateManyWhere.at(-1), { id: 123, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'CLINIC_BILL_DELETE')
})