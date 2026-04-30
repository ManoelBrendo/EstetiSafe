const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  buildInventoryDashboard,
  getInventoryDueStatus,
  getScopedInventoryUserId,
  normalizeEquipmentData,
  normalizeProductData,
  registerInventoryRoutes,
  summarizeEquipmentItem,
  summarizeProductItem,
} = require('../src/legacy/inventory')


function createInventoryRouteHarness() {
  const currentUser = {
    id: 77,
    email: 'clinica@example.com',
    ownedClinic: { id: 14 },
  }
  const baseProduct = {
    id: 501,
    userId: currentUser.id,
    name: 'Sérum clareador',
    category: 'Cosmético',
    brand: 'Marca X',
    batch: 'L-2026',
    quantity: 4,
    unit: 'un',
    entryMode: 'NEW',
    purchasedAt: new Date('2026-04-01T00:00:00.000Z'),
    expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    notes: null,
    active: true,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  }
  const baseEquipment = {
    id: 701,
    userId: currentUser.id,
    name: 'Laser facial',
    category: 'Laser',
    brand: 'Marca Y',
    model: 'LX',
    serialNumber: 'SN-1',
    anvisaRegistration: '123',
    notificationNumber: '456',
    processNumber: '789',
    entryMode: 'EXISTING',
    acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
    maintenanceDueAt: new Date('2026-09-01T00:00:00.000Z'),
    warrantyUntil: new Date('2027-01-01T00:00:00.000Z'),
    notes: null,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  }
  const calls = {
    productFindManyWhere: [],
    equipmentFindManyWhere: [],
    productFindWhere: [],
    equipmentFindWhere: [],
    productCreateData: [],
    equipmentCreateData: [],
    productUpdateManyWhere: [],
    equipmentUpdateManyWhere: [],
    audit: [],
  }
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  registerInventoryRoutes({
    app,
    prisma: {
      productItem: {
        findMany: async ({ where }) => {
          calls.productFindManyWhere.push(where)
          return [baseProduct]
        },
        findFirstOrThrow: async ({ where }) => {
          calls.productFindWhere.push(where)
          return { ...baseProduct, id: where.id, userId: where.userId }
        },
        create: async ({ data }) => {
          calls.productCreateData.push(data)
          return { ...baseProduct, ...data, id: 601 }
        },
        update: async ({ where, data }) => ({ ...baseProduct, id: where.id, ...data }),
        updateMany: async ({ where, data }) => {
          calls.productUpdateManyWhere.push(where)
          return { count: data.active === false ? 1 : 0 }
        },
      },
      equipmentItem: {
        findMany: async ({ where }) => {
          calls.equipmentFindManyWhere.push(where)
          return [baseEquipment]
        },
        findFirstOrThrow: async ({ where }) => {
          calls.equipmentFindWhere.push(where)
          return { ...baseEquipment, id: where.id, userId: where.userId }
        },
        create: async ({ data }) => {
          calls.equipmentCreateData.push(data)
          return { ...baseEquipment, ...data, id: 801 }
        },
        update: async ({ where, data }) => ({ ...baseEquipment, id: where.id, ...data }),
        updateMany: async ({ where, data }) => {
          calls.equipmentUpdateManyWhere.push(where)
          return { count: data.active === false ? 1 : 0 }
        },
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
    parseDateOnly: value => new Date(`${value}T00:00:00.000Z`),
    createAuditLogFromRequest: async (_req, payload) => {
      calls.audit.push(payload)
      return payload
    },
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
test('getScopedInventoryUserId prefers currentUser over legacy user', () => {
  assert.equal(getScopedInventoryUserId({ currentUser: { id: 77 }, user: { id: 999 } }), 77)
  assert.equal(getScopedInventoryUserId({ user: { id: 999 } }), 999)
})

test('getInventoryDueStatus handles invalid dates without false valid status', () => {
  assert.deepEqual(getInventoryDueStatus('invalid-date'), {
    status: 'WITHOUT_DATE',
    label: 'Data inválida',
    daysUntilDue: null,
  })
})

test('inventory routes use current user scope and write audit trail', async t => {
  const harness = createInventoryRouteHarness()
  t.after(() => harness.close())

  const summaryResponse = await harness.request('/inventory/summary')
  assert.equal(summaryResponse.status, 200)
  assert.equal(harness.calls.productFindManyWhere.at(-1).userId, 77)
  assert.equal(harness.calls.equipmentFindManyWhere.at(-1).userId, 77)

  const productResponse = await harness.request('/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Sérum clareador',
      category: 'Cosmético',
      quantity: 3,
      entryMode: 'NEW',
      expiresAt: '2026-08-01',
    }),
  })
  assert.equal(productResponse.status, 201)
  assert.equal(harness.calls.productCreateData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).action, 'INVENTORY_PRODUCT_CREATE')

  const productArchiveResponse = await harness.request('/products/501', { method: 'DELETE' })
  assert.equal(productArchiveResponse.status, 200)
  assert.deepEqual(harness.calls.productUpdateManyWhere.at(-1), { id: 501, userId: 77 })
  assert.equal(harness.calls.audit.at(-1).action, 'INVENTORY_PRODUCT_ARCHIVE')

  const equipmentResponse = await harness.request('/equipment', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Laser facial',
      category: 'Laser',
      entryMode: 'EXISTING',
      maintenanceDueAt: '2026-09-01',
    }),
  })
  assert.equal(equipmentResponse.status, 201)
  assert.equal(harness.calls.equipmentCreateData.at(-1).userId, 77)
  assert.equal(harness.calls.audit.at(-1).action, 'INVENTORY_EQUIPMENT_CREATE')
})