const { z } = require('zod')

const inventoryEntryModeSchema = z.enum(['NEW', 'EXISTING'])

const productItemSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  batch: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(0).default(1),
  unit: z.string().trim().max(40).optional(),
  entryMode: inventoryEntryModeSchema.default('NEW'),
  purchasedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().trim().max(1200).optional(),
  active: z.boolean().optional(),
})

const equipmentItemSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  anvisaRegistration: z.string().trim().max(120).optional(),
  notificationNumber: z.string().trim().max(120).optional(),
  processNumber: z.string().trim().max(120).optional(),
  entryMode: inventoryEntryModeSchema.default('NEW'),
  acquiredAt: z.string().optional(),
  maintenanceDueAt: z.string().optional(),
  warrantyUntil: z.string().optional(),
  notes: z.string().trim().max(1200).optional(),
  active: z.boolean().optional(),
})

function getInventoryDueStatus(date, warningDays = 30) {
  if (!date) {
    return {
      status: 'WITHOUT_DATE',
      label: 'Sem data informada',
      daysUntilDue: null,
    }
  }

  const now = new Date()
  const dueAt = new Date(date)
  dueAt.setHours(23, 59, 59, 999)

  const daysUntilDue = Math.ceil((dueAt.getTime() - now.getTime()) / 86400000)

  if (daysUntilDue < 0) {
    return {
      status: 'OVERDUE',
      label: 'Vencido',
      daysUntilDue,
    }
  }

  if (daysUntilDue <= warningDays) {
    return {
      status: 'WARNING',
      label: `Vence em ${daysUntilDue} dia(s)`,
      daysUntilDue,
    }
  }

  return {
    status: 'VALID',
    label: 'Em dia',
    daysUntilDue,
  }
}

function summarizeProductItem(record) {
  if (!record) return null

  const expiry = getInventoryDueStatus(record.expiresAt)

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    brand: record.brand,
    batch: record.batch,
    quantity: record.quantity,
    unit: record.unit,
    entryMode: record.entryMode,
    purchasedAt: record.purchasedAt,
    expiresAt: record.expiresAt,
    notes: record.notes,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: expiry.status,
    statusLabel: expiry.label,
    daysUntilDue: expiry.daysUntilDue,
  }
}

function summarizeEquipmentItem(record) {
  if (!record) return null

  const maintenance = getInventoryDueStatus(record.maintenanceDueAt)

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    brand: record.brand,
    model: record.model,
    serialNumber: record.serialNumber,
    anvisaRegistration: record.anvisaRegistration,
    notificationNumber: record.notificationNumber,
    processNumber: record.processNumber,
    entryMode: record.entryMode,
    acquiredAt: record.acquiredAt,
    maintenanceDueAt: record.maintenanceDueAt,
    warrantyUntil: record.warrantyUntil,
    notes: record.notes,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: maintenance.status,
    statusLabel: maintenance.label,
    daysUntilDue: maintenance.daysUntilDue,
  }
}

function buildInventoryDashboard(products, equipmentItems) {
  const summarizedProducts = products.map(summarizeProductItem)
  const summarizedEquipment = equipmentItems.map(summarizeEquipmentItem)
  const alerts = [
    ...summarizedProducts
      .filter(item => item.status === 'WARNING' || item.status === 'OVERDUE')
      .map(item => ({ ...item, assetType: 'PRODUCT' })),
    ...summarizedEquipment
      .filter(item => item.status === 'WARNING' || item.status === 'OVERDUE')
      .map(item => ({ ...item, assetType: 'EQUIPMENT' })),
  ]
    .sort((left, right) => {
      const leftScore = left.daysUntilDue ?? Number.MAX_SAFE_INTEGER
      const rightScore = right.daysUntilDue ?? Number.MAX_SAFE_INTEGER
      return leftScore - rightScore
    })
    .slice(0, 6)

  return {
    totalProducts: summarizedProducts.length,
    totalEquipment: summarizedEquipment.length,
    expiringProducts: summarizedProducts.filter(item => item.status === 'WARNING').length,
    expiredProducts: summarizedProducts.filter(item => item.status === 'OVERDUE').length,
    dueEquipment: summarizedEquipment.filter(item => item.status === 'WARNING').length,
    overdueEquipment: summarizedEquipment.filter(item => item.status === 'OVERDUE').length,
    alerts,
  }
}

function normalizeProductData(data, parseDateOnly) {
  const normalized = {}

  if ('name' in data) normalized.name = data.name.trim()
  if ('category' in data) normalized.category = data.category?.trim() || null
  if ('brand' in data) normalized.brand = data.brand?.trim() || null
  if ('batch' in data) normalized.batch = data.batch?.trim() || null
  if ('quantity' in data) normalized.quantity = data.quantity
  if ('unit' in data) normalized.unit = data.unit?.trim() || null
  if ('entryMode' in data) normalized.entryMode = data.entryMode
  if ('purchasedAt' in data) normalized.purchasedAt = data.purchasedAt ? parseDateOnly(data.purchasedAt, 'purchasedAt') : null
  if ('expiresAt' in data) normalized.expiresAt = data.expiresAt ? parseDateOnly(data.expiresAt, 'expiresAt') : null
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('active' in data) normalized.active = data.active

  return normalized
}

function normalizeEquipmentData(data, parseDateOnly) {
  const normalized = {}

  if ('name' in data) normalized.name = data.name.trim()
  if ('category' in data) normalized.category = data.category?.trim() || null
  if ('brand' in data) normalized.brand = data.brand?.trim() || null
  if ('model' in data) normalized.model = data.model?.trim() || null
  if ('serialNumber' in data) normalized.serialNumber = data.serialNumber?.trim() || null
  if ('anvisaRegistration' in data) normalized.anvisaRegistration = data.anvisaRegistration?.trim() || null
  if ('notificationNumber' in data) normalized.notificationNumber = data.notificationNumber?.trim() || null
  if ('processNumber' in data) normalized.processNumber = data.processNumber?.trim() || null
  if ('entryMode' in data) normalized.entryMode = data.entryMode
  if ('acquiredAt' in data) normalized.acquiredAt = data.acquiredAt ? parseDateOnly(data.acquiredAt, 'acquiredAt') : null
  if ('maintenanceDueAt' in data) normalized.maintenanceDueAt = data.maintenanceDueAt ? parseDateOnly(data.maintenanceDueAt, 'maintenanceDueAt') : null
  if ('warrantyUntil' in data) normalized.warrantyUntil = data.warrantyUntil ? parseDateOnly(data.warrantyUntil, 'warrantyUntil') : null
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('active' in data) normalized.active = data.active

  return normalized
}

function registerInventoryRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateOnly,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    handle,
    parseId,
    parseDateOnly,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerInventoryRoutes requer ${key}`)
    }
  }

  app.get('/inventory/summary', authMiddleware, handle(async (req, res) => {
    const [products, equipmentItems] = await Promise.all([
      prisma.productItem.findMany({
        where: { userId: req.user.id, active: true },
      }),
      prisma.equipmentItem.findMany({
        where: { userId: req.user.id, active: true },
      }),
    ])

    res.json(buildInventoryDashboard(products, equipmentItems))
  }))

  app.get('/products', authMiddleware, handle(async (req, res) => {
    const list = await prisma.productItem.findMany({
      where: { userId: req.user.id, active: true },
      orderBy: [
        { expiresAt: 'asc' },
        { name: 'asc' },
      ],
    })

    res.json(list.map(summarizeProductItem))
  }))

  app.post('/products', authMiddleware, handle(async (req, res) => {
    const data = productItemSchema.parse(req.body)
    const product = await prisma.productItem.create({
      data: {
        ...normalizeProductData(data, parseDateOnly),
        userId: req.user.id,
      },
    })

    res.status(201).json(summarizeProductItem(product))
  }))

  app.put('/products/:id', authMiddleware, handle(async (req, res) => {
    const productId = parseId(req.params.id, 'productId')
    const data = productItemSchema.partial().parse(req.body)

    await prisma.productItem.findFirstOrThrow({
      where: { id: productId, userId: req.user.id },
    })

    const product = await prisma.productItem.update({
      where: { id: productId },
      data: normalizeProductData(data, parseDateOnly),
    })

    res.json(summarizeProductItem(product))
  }))

  app.delete('/products/:id', authMiddleware, handle(async (req, res) => {
    const productId = parseId(req.params.id, 'productId')

    await prisma.productItem.updateMany({
      where: { id: productId, userId: req.user.id },
      data: { active: false },
    })

    res.json({ ok: true })
  }))

  app.get('/equipment', authMiddleware, handle(async (req, res) => {
    const list = await prisma.equipmentItem.findMany({
      where: { userId: req.user.id, active: true },
      orderBy: [
        { maintenanceDueAt: 'asc' },
        { name: 'asc' },
      ],
    })

    res.json(list.map(summarizeEquipmentItem))
  }))

  app.post('/equipment', authMiddleware, handle(async (req, res) => {
    const data = equipmentItemSchema.parse(req.body)
    const equipment = await prisma.equipmentItem.create({
      data: {
        ...normalizeEquipmentData(data, parseDateOnly),
        userId: req.user.id,
      },
    })

    res.status(201).json(summarizeEquipmentItem(equipment))
  }))

  app.put('/equipment/:id', authMiddleware, handle(async (req, res) => {
    const equipmentId = parseId(req.params.id, 'equipmentId')
    const data = equipmentItemSchema.partial().parse(req.body)

    await prisma.equipmentItem.findFirstOrThrow({
      where: { id: equipmentId, userId: req.user.id },
    })

    const equipment = await prisma.equipmentItem.update({
      where: { id: equipmentId },
      data: normalizeEquipmentData(data, parseDateOnly),
    })

    res.json(summarizeEquipmentItem(equipment))
  }))

  app.delete('/equipment/:id', authMiddleware, handle(async (req, res) => {
    const equipmentId = parseId(req.params.id, 'equipmentId')

    await prisma.equipmentItem.updateMany({
      where: { id: equipmentId, userId: req.user.id },
      data: { active: false },
    })

    res.json({ ok: true })
  }))
}

module.exports = {
  buildInventoryDashboard,
  getInventoryDueStatus,
  normalizeEquipmentData,
  normalizeProductData,
  registerInventoryRoutes,
  summarizeEquipmentItem,
  summarizeProductItem,
}