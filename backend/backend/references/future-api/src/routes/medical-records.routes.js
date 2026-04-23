const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { httpError, parseDateOrNull } = require('../lib/http')
const { requireAuth, requireRole } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { assertMedicalRecordEditable, loadMedicalRecordOrThrow } = require('../middleware/medical-record-lock')
const {
  aestheticEvaluationReplaceSchema,
  anamnesisUpsertSchema,
  clientIdParamSchema,
  idParamSchema,
  medicalRecordLockSchema,
} = require('../schemas')

const medicalRecordsRouter = express.Router()
const medicalRecordInclude = {
  client: true,
  anamnesis: {
    include: {
      aestheticHistory: true,
    },
  },
  aestheticEvaluations: true,
  protocols: {
    include: {
      services: {
        include: { service: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  },
  payments: true,
  pdfDocuments: true,
}

function buildMedicalRecordSummary(record) {
  const protocolServicesCount = (record.protocols || []).reduce((total, protocol) => total + (protocol.services?.length || 0), 0)
  const latestPayment = record.payments?.[0] || null

  return {
    medicalRecord: {
      id: record.id,
      clientId: record.clientId,
      isPaid: record.isPaid,
      isLocked: record.isLocked,
      lockedAt: record.lockedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    client: record.client ? {
      id: record.client.id,
      fullName: record.client.fullName,
      phone: record.client.phone,
      email: record.client.email,
      status: record.client.status,
    } : null,
    counts: {
      evaluations: record.aestheticEvaluations?.length || 0,
      protocols: record.protocols?.length || 0,
      protocolServices: protocolServicesCount,
      payments: record.payments?.length || 0,
      documents: record.pdfDocuments?.length || 0,
      aestheticHistory: record.anamnesis?.aestheticHistory?.length || 0,
    },
    latestPayment: latestPayment ? {
      id: latestPayment.id,
      paymentStatus: latestPayment.paymentStatus,
      amount: latestPayment.amount,
      paidAt: latestPayment.paidAt,
      createdAt: latestPayment.createdAt,
    } : null,
    access: {
      readOnly: Boolean(record.isLocked),
      canEditAnamnesis: !record.isLocked,
      canEditProtocols: !record.isLocked,
      canDownloadPdf: true,
      canViewInsideSaas: true,
    },
  }
}

function buildMedicalRecordAccessState(record) {
  return {
    medicalRecordId: record.id,
    isPaid: Boolean(record.isPaid),
    isLocked: Boolean(record.isLocked),
    lockedAt: record.lockedAt || null,
    readOnly: Boolean(record.isLocked),
    allowedActions: {
      view: true,
      downloadPdf: true,
      editAnamnesis: !record.isLocked,
      editProtocols: !record.isLocked,
      editEvaluations: !record.isLocked,
      editRecommendations: !record.isLocked,
    },
  }
}

medicalRecordsRouter.get('/by-client/:clientId', requireAuth, validate({ params: clientIdParamSchema }), asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findFirst({
    where: { clientId: req.params.clientId },
    include: medicalRecordInclude,
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado.')
  }

  res.json(record)
}))

medicalRecordsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: medicalRecordInclude,
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado.')
  }

  res.json(record)
}))

medicalRecordsRouter.get('/:id/summary', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: medicalRecordInclude,
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado.')
  }

  res.json(buildMedicalRecordSummary(record))
}))

medicalRecordsRouter.get('/:id/access-state', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
    },
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado.')
  }

  res.json(buildMedicalRecordAccessState(record))
}))

medicalRecordsRouter.put('/:id/anamnesis', requireAuth, validate({ params: idParamSchema, body: anamnesisUpsertSchema }), asyncHandler(async (req, res) => {
  const payload = req.body

  const updated = await prisma.$transaction(async tx => {
    const record = await assertMedicalRecordEditable(tx, req.params.id)

    const anamnesis = await tx.anamnesis.upsert({
      where: { medicalRecordId: record.id },
      create: {
        medicalRecordId: record.id,
        chiefComplaint: payload.chiefComplaint ?? null,
        expectations: payload.expectations ?? null,
        treatmentObjective: payload.treatmentObjective ?? null,
        workoutsPerWeek: payload.workoutsPerWeek ?? null,
        smoking: payload.smoking ?? null,
        alcoholUse: payload.alcoholUse ?? null,
        waterIntakeLiters: payload.waterIntakeLiters ?? null,
        sleepQuality: payload.sleepQuality ?? null,
        allergies: payload.allergies ?? null,
        medications: payload.medications ?? null,
        diseases: payload.diseases ?? null,
        surgeries: payload.surgeries ?? null,
        pregnancyStatus: payload.pregnancyStatus ?? null,
      },
      update: {
        chiefComplaint: payload.chiefComplaint ?? null,
        expectations: payload.expectations ?? null,
        treatmentObjective: payload.treatmentObjective ?? null,
        workoutsPerWeek: payload.workoutsPerWeek ?? null,
        smoking: payload.smoking ?? null,
        alcoholUse: payload.alcoholUse ?? null,
        waterIntakeLiters: payload.waterIntakeLiters ?? null,
        sleepQuality: payload.sleepQuality ?? null,
        allergies: payload.allergies ?? null,
        medications: payload.medications ?? null,
        diseases: payload.diseases ?? null,
        surgeries: payload.surgeries ?? null,
        pregnancyStatus: payload.pregnancyStatus ?? null,
      },
    })

    await tx.aestheticHistory.deleteMany({
      where: { anamnesisId: anamnesis.id },
    })

    if (payload.aestheticHistory.length) {
      await tx.aestheticHistory.createMany({
        data: payload.aestheticHistory.map(item => ({
          anamnesisId: anamnesis.id,
          procedureName: item.procedureName,
          procedureDate: parseDateOrNull(item.procedureDate),
          notes: item.notes ?? null,
          complications: item.complications ?? null,
        })),
      })
    }

    const hydrated = await tx.medicalRecord.findUnique({
      where: { id: record.id },
      include: medicalRecordInclude,
    })

    await recordAudit(tx, {
      entityType: 'MedicalRecord',
      entityId: record.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      newData: hydrated,
    })

    return hydrated
  })

  res.json(updated)
}))

medicalRecordsRouter.put('/:id/evaluations', requireAuth, validate({ params: idParamSchema, body: aestheticEvaluationReplaceSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const record = await assertMedicalRecordEditable(tx, req.params.id)

    await tx.aestheticEvaluation.deleteMany({
      where: { medicalRecordId: record.id },
    })

    if (req.body.items.length) {
      await tx.aestheticEvaluation.createMany({
        data: req.body.items.map(item => ({
          medicalRecordId: record.id,
          evaluationType: item.evaluationType,
          classification: item.classification ?? null,
          intensity: item.intensity ?? null,
          level: item.level ?? null,
          notes: item.notes ?? null,
        })),
      })
    }

    const hydrated = await tx.medicalRecord.findUnique({
      where: { id: record.id },
      include: medicalRecordInclude,
    })

    await recordAudit(tx, {
      entityType: 'MedicalRecord',
      entityId: record.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      newData: hydrated,
    })

    return hydrated
  })

  res.json(updated)
}))

medicalRecordsRouter.patch('/:id/lock', requireAuth, requireRole('support', 'admin'), validate({ params: idParamSchema, body: medicalRecordLockSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await loadMedicalRecordOrThrow(tx, req.params.id)
    const next = await tx.medicalRecord.update({
      where: { id: current.id },
      data: {
        isLocked: true,
        lockedAt: req.body.lockedAt ? new Date(req.body.lockedAt) : new Date(),
      },
      include: medicalRecordInclude,
    })

    await recordAudit(tx, {
      entityType: 'MedicalRecord',
      entityId: current.id,
      actionType: 'lock',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

medicalRecordsRouter.patch('/:id/unlock', requireAuth, requireRole('support', 'admin'), validate({ params: idParamSchema, body: medicalRecordLockSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await loadMedicalRecordOrThrow(tx, req.params.id)
    const next = await tx.medicalRecord.update({
      where: { id: current.id },
      data: {
        isLocked: false,
        lockedAt: null,
      },
      include: medicalRecordInclude,
    })

    await recordAudit(tx, {
      entityType: 'MedicalRecord',
      entityId: current.id,
      actionType: 'unlock',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

module.exports = {
  medicalRecordsRouter,
}
