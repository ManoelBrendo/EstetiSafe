const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildClinicBillsDashboard,
  getBillDueStatus,
  normalizeClinicBillData,
  summarizeClinicBill,
} = require('../src/legacy/billing')

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