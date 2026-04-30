const { z } = require('zod')

const billingConfigSchema = z.object({
  amount: z.number().min(0).nullable().optional(),
  nextDueAt: z.string().optional(),
  reference: z.string().trim().max(280).optional(),
  notes: z.string().trim().max(1200).optional(),
})

const billingMarkPaidSchema = z.object({
  amount: z.number().min(0).optional(),
  nextDueAt: z.string().optional(),
})

const clinicBillSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().max(100).optional(),
  amount: z.number().min(0),
  dueAt: z.string().min(1),
  paidAt: z.string().optional(),
  notes: z.string().trim().max(1200).optional(),
  active: z.boolean().optional(),
})

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : fallback
}

function getBillDueStatus(date, warningDays = 30) {
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
    status: 'OK',
    label: 'Em dia',
    daysUntilDue,
  }
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function summarizeClinicBill(record) {
  if (!record) return null

  const due = getBillDueStatus(record.dueAt, 0)
  const paid = Boolean(record.paidAt)
  const status = paid ? 'PAID' : due.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING'
  const statusLabel = paid
    ? 'Pago'
    : status === 'OVERDUE'
      ? 'Em atraso'
      : due.label

  return {
    id: record.id,
    title: record.title,
    category: record.category,
    amount: toSafeNumber(record.amount),
    dueAt: record.dueAt,
    paidAt: record.paidAt,
    notes: record.notes,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status,
    statusLabel,
  }
}

function buildClinicBillsDashboard(records) {
  const bills = (Array.isArray(records) ? records : []).map(summarizeClinicBill).filter(Boolean)
  const openBills = bills.filter(bill => bill.status !== 'PAID')
  const overdueBills = bills.filter(bill => bill.status === 'OVERDUE')
  const paidBills = bills.filter(bill => bill.status === 'PAID')
  const monthStart = startOfMonth(new Date())
  const nextMonth = startOfNextMonth(new Date())
  const paidThisMonth = paidBills.filter(bill => bill.paidAt && new Date(bill.paidAt) >= monthStart && new Date(bill.paidAt) < nextMonth)

  const totalOpenAmount = openBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const overdueAmount = overdueBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const paidThisMonthAmount = paidThisMonth.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)

  return {
    openCount: openBills.length,
    overdueCount: overdueBills.length,
    paidCount: paidBills.length,
    totalOpenAmount: Number(totalOpenAmount.toFixed(2)),
    overdueAmount: Number(overdueAmount.toFixed(2)),
    paidThisMonthAmount: Number(paidThisMonthAmount.toFixed(2)),
    bills,
  }
}

function normalizeClinicBillData(data, parseDateOnly) {
  const normalized = {}

  if ('title' in data) normalized.title = data.title.trim()
  if ('category' in data) normalized.category = data.category?.trim() || null
  if ('amount' in data) normalized.amount = toSafeNumber(data.amount)
  if ('dueAt' in data) normalized.dueAt = data.dueAt ? parseDateOnly(data.dueAt, 'dueAt') : null
  if ('paidAt' in data) normalized.paidAt = data.paidAt ? parseDateOnly(data.paidAt, 'paidAt') : null
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('active' in data) normalized.active = data.active

  return normalized
}

function serializeBillAuditDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function buildClinicBillAuditMetadata(record, overrides = {}) {
  const summary = summarizeClinicBill(record) || {}

  return {
    title: summary.title || null,
    category: summary.category || null,
    amount: summary.amount ?? null,
    dueAt: serializeBillAuditDate(summary.dueAt),
    paidAt: serializeBillAuditDate(summary.paidAt),
    status: summary.status || null,
    statusLabel: summary.statusLabel || null,
    ...overrides,
  }
}

function registerBillingRoutes({
  app,
  prisma,
  authMiddleware,
  requireSupportBillingControl,
  handle,
  parseId,
  parseDateOnly,
  ensureClinicAggregate,
  getBillingSnapshot,
  mapBillingStatusToClinicStatus,
  createAuditLogFromRequest,
  serializeAuditLog,
  addDays,
  supportAdminName,
  supportAdminEmail,
  canManageSubscription,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    requireSupportBillingControl,
    handle,
    parseId,
    parseDateOnly,
    ensureClinicAggregate,
    getBillingSnapshot,
    mapBillingStatusToClinicStatus,
    createAuditLogFromRequest,
    serializeAuditLog,
    addDays,
    supportAdminName,
    supportAdminEmail,
    canManageSubscription,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerBillingRoutes requer ${key}`)
    }
  }

  app.get('/billing/summary', authMiddleware, handle(async (req, res) => {
    const billing = req.billing || getBillingSnapshot(req.currentUser)

    res.json({
      clinicId: req.currentUser?.ownedClinic?.id || null,
      clinicName: req.currentUser?.clinicName || supportAdminName,
      email: req.currentUser?.email || supportAdminEmail,
      billing,
      permissions: {
        canManageSubscription: canManageSubscription(req),
      },
    })
  }))

  app.put('/billing/config', authMiddleware, requireSupportBillingControl, handle(async (req, res) => {
    const data = billingConfigSchema.parse(req.body)
    const clinicId = req.currentUser.ownedClinic?.id
    const currentSubscription = req.currentUser.ownedClinic?.subscription

    const nextStatus = currentSubscription?.status || req.currentUser.billingStatus || 'TRIAL'
    const nextAmount = Object.prototype.hasOwnProperty.call(data, 'amount')
      ? data.amount
      : (currentSubscription?.amount ?? req.currentUser.billingAmount ?? null)
    const nextDueAt = data.nextDueAt
      ? parseDateOnly(data.nextDueAt, 'nextDueAt')
      : (currentSubscription?.nextDueAt || req.currentUser.billingNextDueAt || null)
    const nextReference = Object.prototype.hasOwnProperty.call(data, 'reference')
      ? (data.reference?.trim() || null)
      : (currentSubscription?.reference ?? req.currentUser.billingReference ?? null)
    const nextNotes = Object.prototype.hasOwnProperty.call(data, 'notes')
      ? (data.notes?.trim() || null)
      : (currentSubscription?.notes ?? req.currentUser.billingNotes ?? null)
    const nextGraceEndsAt = currentSubscription?.graceEndsAt || req.currentUser.billingGraceEndsAt || addDays(req.currentUser.createdAt, 7)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.currentUser.id },
        data: {
          billingStatus: nextStatus,
          billingAmount: nextAmount,
          billingGraceEndsAt: nextGraceEndsAt,
          billingNextDueAt: nextDueAt,
          billingReference: nextReference,
          billingNotes: nextNotes,
        },
      }),
      prisma.clinic.update({
        where: { ownerUserId: req.currentUser.id },
        data: {
          status: mapBillingStatusToClinicStatus(nextStatus),
          subscription: {
            upsert: {
              create: {
                status: nextStatus,
                amount: nextAmount,
                graceEndsAt: nextGraceEndsAt,
                nextDueAt,
                reference: nextReference,
                notes: nextNotes,
              },
              update: {
                status: nextStatus,
                amount: nextAmount,
                graceEndsAt: nextGraceEndsAt,
                nextDueAt,
                reference: nextReference,
                notes: nextNotes,
              },
            },
          },
        },
      }),
    ])

    const user = await ensureClinicAggregate(req.currentUser.id)

    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'BILLING_CONFIG_UPDATED',
      entityType: 'ClinicSubscription',
      entityId: clinicId,
      metadata: {
        amount: nextAmount,
        nextDueAt,
        reference: nextReference,
      },
    })

    res.json({
      clinicId: user.ownedClinic?.id || null,
      clinicName: user.clinicName,
      email: user.email,
      billing: getBillingSnapshot(user),
      permissions: {
        canManageSubscription: canManageSubscription(req),
      },
    })
  }))

  app.post('/billing/mark-paid', authMiddleware, requireSupportBillingControl, handle(async (req, res) => {
    const data = billingMarkPaidSchema.parse(req.body)
    const now = new Date()
    const nextDueAt = data.nextDueAt ? parseDateOnly(data.nextDueAt, 'nextDueAt') : addDays(now, 30)
    const currentSubscription = req.currentUser.ownedClinic?.subscription
    const nextAmount = typeof data.amount === 'number'
      ? data.amount
      : (currentSubscription?.amount ?? req.currentUser.billingAmount ?? null)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.currentUser.id },
        data: {
          billingStatus: 'ACTIVE',
          billingAmount: nextAmount,
          billingLastPaidAt: now,
          billingNextDueAt: nextDueAt,
          billingGraceEndsAt: null,
        },
      }),
      prisma.clinic.update({
        where: { ownerUserId: req.currentUser.id },
        data: {
          status: 'ACTIVE',
          subscription: {
            upsert: {
              create: {
                status: 'ACTIVE',
                amount: nextAmount,
                lastPaidAt: now,
                nextDueAt,
                graceEndsAt: null,
                reference: currentSubscription?.reference ?? req.currentUser.billingReference ?? null,
                notes: currentSubscription?.notes ?? req.currentUser.billingNotes ?? null,
              },
              update: {
                status: 'ACTIVE',
                amount: nextAmount,
                lastPaidAt: now,
                nextDueAt,
                graceEndsAt: null,
              },
            },
          },
        },
      }),
    ])

    const user = await ensureClinicAggregate(req.currentUser.id)

    await createAuditLogFromRequest(req, {
      clinicId: user.ownedClinic?.id || null,
      action: 'BILLING_MARKED_PAID',
      entityType: 'ClinicSubscription',
      entityId: user.ownedClinic?.id || null,
      metadata: {
        amount: nextAmount,
        nextDueAt,
        paidAt: now,
      },
    })

    res.json({
      clinicId: user.ownedClinic?.id || null,
      clinicName: user.clinicName,
      email: user.email,
      billing: getBillingSnapshot(user),
      permissions: {
        canManageSubscription: canManageSubscription(req),
      },
    })
  }))

  app.get('/clinic/audit-logs', authMiddleware, handle(async (req, res) => {
    const limitValue = Number(req.query.limit || 50)
    const limit = Number.isInteger(limitValue)
      ? Math.max(1, Math.min(limitValue, 100))
      : 50

    const logs = await prisma.auditLog.findMany({
      where: {
        clinicId: req.currentUser.ownedClinic?.id || null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    })

    res.json({
      logs: logs.map(serializeAuditLog),
    })
  }))

  app.get('/billing/bills', authMiddleware, handle(async (req, res) => {
    const records = await prisma.clinicBill.findMany({
      where: { userId: req.currentUser.id, active: true },
      orderBy: [
        { paidAt: 'asc' },
        { dueAt: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    res.json(buildClinicBillsDashboard(records))
  }))

  app.post('/billing/bills', authMiddleware, handle(async (req, res) => {
    const data = clinicBillSchema.parse(req.body)
    const record = await prisma.clinicBill.create({
      data: {
        ...normalizeClinicBillData(data, parseDateOnly),
        userId: req.currentUser.id,
      },
    })
    const summary = summarizeClinicBill(record)

    await createAuditLogFromRequest(req, {
      clinicId: req.currentUser.ownedClinic?.id || null,
      action: 'CLINIC_BILL_CREATE',
      entityType: 'ClinicBill',
      entityId: record.id,
      metadata: buildClinicBillAuditMetadata(record),
    })

    res.status(201).json(summary)
  }))

  app.put('/billing/bills/:id', authMiddleware, handle(async (req, res) => {
    const billId = parseId(req.params.id, 'billId')
    const data = clinicBillSchema.partial().parse(req.body)

    const previousRecord = await prisma.clinicBill.findFirstOrThrow({
      where: { id: billId, userId: req.currentUser.id, active: true },
    })

    const record = await prisma.clinicBill.update({
      where: { id: billId },
      data: normalizeClinicBillData(data, parseDateOnly),
    })
    const summary = summarizeClinicBill(record)

    await createAuditLogFromRequest(req, {
      clinicId: req.currentUser.ownedClinic?.id || null,
      action: 'CLINIC_BILL_UPDATE',
      entityType: 'ClinicBill',
      entityId: billId,
      metadata: buildClinicBillAuditMetadata(record, {
        previous: buildClinicBillAuditMetadata(previousRecord),
      }),
    })

    res.json(summary)
  }))

  app.post('/billing/bills/:id/mark-paid', authMiddleware, handle(async (req, res) => {
    const billId = parseId(req.params.id, 'billId')

    const previousRecord = await prisma.clinicBill.findFirstOrThrow({
      where: { id: billId, userId: req.currentUser.id, active: true },
    })

    const paidAt = new Date()
    const record = await prisma.clinicBill.update({
      where: { id: billId },
      data: { paidAt },
    })
    const summary = summarizeClinicBill(record)

    await createAuditLogFromRequest(req, {
      clinicId: req.currentUser.ownedClinic?.id || null,
      action: 'CLINIC_BILL_MARK_PAID',
      entityType: 'ClinicBill',
      entityId: billId,
      metadata: buildClinicBillAuditMetadata(record, {
        previousStatus: summarizeClinicBill(previousRecord)?.status || null,
        paidAt: paidAt.toISOString(),
      }),
    })

    res.json(summary)
  }))

  app.delete('/billing/bills/:id', authMiddleware, handle(async (req, res) => {
    const billId = parseId(req.params.id, 'billId')

    const previousRecord = await prisma.clinicBill.findFirstOrThrow({
      where: { id: billId, userId: req.currentUser.id, active: true },
    })

    await prisma.clinicBill.updateMany({
      where: { id: billId, userId: req.currentUser.id },
      data: { active: false },
    })

    await createAuditLogFromRequest(req, {
      clinicId: req.currentUser.ownedClinic?.id || null,
      action: 'CLINIC_BILL_DELETE',
      entityType: 'ClinicBill',
      entityId: billId,
      metadata: buildClinicBillAuditMetadata(previousRecord, {
        active: false,
      }),
    })

    res.json({ ok: true })
  }))
}

module.exports = {
  buildClinicBillsDashboard,
  getBillDueStatus,
  normalizeClinicBillData,
  registerBillingRoutes,
  summarizeClinicBill,
  toSafeNumber,
}
