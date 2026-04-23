const express = require('express')
const { anamnesisUpsertSchema } = require('../schemas')
const { asyncHandler, parseUuid } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildMedicalRecord } = require('../lib/serializers')
const {
  getMedicalRecordById,
  getOrCreateMedicalRecordForClient,
  assertMedicalRecordEditable,
  upsertAnamnesis,
  replaceAestheticEvaluations,
  lockMedicalRecord,
  unlockMedicalRecord,
} = require('../lib/medical-records')

function createMedicalRecordsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const medicalRecord = await getOrCreateMedicalRecordForClient(context.prisma, req.params.clientId)
    res.json(buildMedicalRecord(medicalRecord))
  }))

  router.put('/by-client/:clientId/anamnesis', asyncHandler(async (req, res) => {
    const payload = anamnesisUpsertSchema.parse(req.body)
    const medicalRecord = await getOrCreateMedicalRecordForClient(context.prisma, req.params.clientId)
    assertMedicalRecordEditable(medicalRecord)

    let updated = await upsertAnamnesis(context.prisma, medicalRecord.id, payload)

    if (payload.aestheticEvaluations) {
      updated = await replaceAestheticEvaluations(context.prisma, medicalRecord.id, payload.aestheticEvaluations)
    }

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'update',
      entityType: 'MedicalRecord',
      entityId: medicalRecord.id,
      newData: buildMedicalRecord(updated),
    })

    res.json(buildMedicalRecord(updated))
  }))

  router.put('/:medicalRecordId/evaluations', asyncHandler(async (req, res) => {
    const medicalRecordId = parseUuid(req.params.medicalRecordId, 'medicalRecordId')
    const medicalRecord = await getMedicalRecordById(context.prisma, medicalRecordId)
    assertMedicalRecordEditable(medicalRecord)
    const payload = anamnesisUpsertSchema.pick({ aestheticEvaluations: true }).parse(req.body)

    const updated = await replaceAestheticEvaluations(context.prisma, medicalRecordId, payload.aestheticEvaluations || [])

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'update',
      entityType: 'AestheticEvaluation',
      entityId: medicalRecordId,
      newData: buildMedicalRecord(updated),
    })

    res.json(buildMedicalRecord(updated))
  }))

  router.post('/:medicalRecordId/lock', asyncHandler(async (req, res) => {
    const updated = await lockMedicalRecord(context.prisma, req.params.medicalRecordId)

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'lock',
      entityType: 'MedicalRecord',
      entityId: updated.id,
      newData: buildMedicalRecord(updated),
    })

    res.json(buildMedicalRecord(updated))
  }))

  router.delete('/:medicalRecordId/lock', asyncHandler(async (req, res) => {
    const updated = await unlockMedicalRecord(context.prisma, req.params.medicalRecordId)

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'unlock',
      entityType: 'MedicalRecord',
      entityId: updated.id,
      newData: buildMedicalRecord(updated),
    })

    res.json(buildMedicalRecord(updated))
  }))

  return router
}

module.exports = {
  createMedicalRecordsRouter,
}
