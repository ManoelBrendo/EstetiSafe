const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildInventoryDashboard,
  getInventoryDueStatus,
  normalizeEquipmentData,
  normalizeProductData,
  summarizeEquipmentItem,
  summarizeProductItem,
} = require('../src/legacy/inventory')

function isoDateFromOffset(daysOffset) {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return date.toISOString()
}

test('getInventoryDueStatus classifies date windows correctly', () => {
  assert.deepEqual(getInventoryDueStatus(null), {
    status: 'WITHOUT_DATE',
    label: 'Sem data informada',
    daysUntilDue: null,
  })

  assert.equal(getInventoryDueStatus(isoDateFromOffset(45)).status, 'VALID')
  assert.equal(getInventoryDueStatus(isoDateFromOffset(5)).status, 'WARNING')
  assert.equal(getInventoryDueStatus(isoDateFromOffset(-2)).status, 'OVERDUE')
})

test('summarizeProductItem maps expiry metadata', () => {
  const item = summarizeProductItem({
    id: 1,
    name: 'Acido hialuronico',
    category: 'Insumo',
    brand: 'Marca X',
    batch: 'L1',
    quantity: 3,
    unit: 'un',
    entryMode: 'NEW',
    purchasedAt: '2026-04-01T00:00:00.000Z',
    expiresAt: isoDateFromOffset(4),
    notes: null,
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  })

  assert.equal(item.status, 'WARNING')
  assert.match(item.statusLabel, /Vence em/)
})

test('summarizeEquipmentItem maps maintenance metadata', () => {
  const item = summarizeEquipmentItem({
    id: 2,
    name: 'Laser',
    category: 'Equipamento',
    brand: 'Marca Y',
    model: 'LX',
    serialNumber: 'ABC123',
    anvisaRegistration: '999',
    notificationNumber: '111',
    processNumber: '222',
    entryMode: 'EXISTING',
    acquiredAt: '2026-01-01T00:00:00.000Z',
    maintenanceDueAt: isoDateFromOffset(-3),
    warrantyUntil: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  })

  assert.equal(item.status, 'OVERDUE')
  assert.equal(item.statusLabel, 'Vencido')
})

test('buildInventoryDashboard computes totals and alerts', () => {
  const dashboard = buildInventoryDashboard([
    {
      id: 1,
      name: 'Produto',
      category: null,
      brand: null,
      batch: null,
      quantity: 1,
      unit: null,
      entryMode: 'NEW',
      purchasedAt: null,
      expiresAt: isoDateFromOffset(3),
      notes: null,
      active: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ], [
    {
      id: 2,
      name: 'Equipamento',
      category: null,
      brand: null,
      model: null,
      serialNumber: null,
      anvisaRegistration: null,
      notificationNumber: null,
      processNumber: null,
      entryMode: 'NEW',
      acquiredAt: null,
      maintenanceDueAt: isoDateFromOffset(-4),
      warrantyUntil: null,
      notes: null,
      active: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ])

  assert.equal(dashboard.totalProducts, 1)
  assert.equal(dashboard.totalEquipment, 1)
  assert.equal(dashboard.expiringProducts, 1)
  assert.equal(dashboard.overdueEquipment, 1)
  assert.equal(dashboard.alerts.length, 2)
})

test('normalizeProductData trims values and delegates date parsing', () => {
  const normalized = normalizeProductData({
    name: '  Produto base ',
    category: '  Categoria ',
    brand: '  Marca ',
    batch: '  Lote  ',
    quantity: 2,
    unit: ' un ',
    entryMode: 'NEW',
    purchasedAt: '2026-05-01',
    expiresAt: '2026-06-01',
    notes: '  observacao  ',
    active: true,
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    name: 'Produto base',
    category: 'Categoria',
    brand: 'Marca',
    batch: 'Lote',
    quantity: 2,
    unit: 'un',
    entryMode: 'NEW',
    purchasedAt: 'purchasedAt:2026-05-01',
    expiresAt: 'expiresAt:2026-06-01',
    notes: 'observacao',
    active: true,
  })
})

test('normalizeEquipmentData trims values and delegates date parsing', () => {
  const normalized = normalizeEquipmentData({
    name: '  Equipamento base ',
    category: '  Equip ',
    brand: '  Marca ',
    model: '  Modelo ',
    serialNumber: '  SN1 ',
    anvisaRegistration: '  123 ',
    notificationNumber: '  456 ',
    processNumber: '  789 ',
    entryMode: 'EXISTING',
    acquiredAt: '2026-01-01',
    maintenanceDueAt: '2026-07-01',
    warrantyUntil: '2027-01-01',
    notes: '  observacao  ',
    active: false,
  }, (value, fieldName) => `${fieldName}:${value}`)

  assert.deepEqual(normalized, {
    name: 'Equipamento base',
    category: 'Equip',
    brand: 'Marca',
    model: 'Modelo',
    serialNumber: 'SN1',
    anvisaRegistration: '123',
    notificationNumber: '456',
    processNumber: '789',
    entryMode: 'EXISTING',
    acquiredAt: 'acquiredAt:2026-01-01',
    maintenanceDueAt: 'maintenanceDueAt:2026-07-01',
    warrantyUntil: 'warrantyUntil:2027-01-01',
    notes: 'observacao',
    active: false,
  })
})