const express = require('express')
const { anamnesisUpsertSchema } = require('../schemas')
const { asyncHandler, parsePositiveInt } = require('../lib/http')
const { createAuditLog } = require('../lib/audit')
const {
  ensureClientOwnership,
  buildMedicalRecord,
  buildMedicalRecordSummary,
  buildAccessState,
  buildMedicalRecordAuditMetadata,
  summarizeAnamnesis,
  createAnamnesisVersion,
} = require('../lib/medical-records')

function createMedicalRecordsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_MEDICAL_RECORD_VIEW',
      entityType: 'Client',
      entityId: client.id,
      metadata: buildMedicalRecordAuditMetadata(client, `/api/v2/medical-records/by-client/${client.id}`),
    })

    res.json(buildMedicalRecord(client))
  }))

  router.get('/by-client/:clientId/summary', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json(buildMedicalRecordSummary(client))
  }))

  router.get('/by-client/:clientId/access-state', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json({
      medicalRecordId: `legacy-client-${client.id}`,
      ...buildAccessState(client),
    })
  }))

  router.get('/by-client/:clientId/anamnesis', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_MEDICAL_RECORD_ANAMNESIS_HISTORY_VIEW',
      entityType: 'Client',
      entityId: client.id,
      metadata: buildMedicalRecordAuditMetadata(client, `/api/v2/medical-records/by-client/${client.id}/anamnesis`, {
        historyCount: client.anamneses?.length || 0,
      }),
    })

    res.json({
      clientId: client.id,
      latest: summarizeAnamnesis(client.anamneses?.[0] || null),
      history: (client.anamneses || []).map(summarizeAnamnesis),
      accessState: buildAccessState(client),
    })
  }))

  router.put('/by-client/:clientId/anamnesis', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const payload = anamnesisUpsertSchema.parse(req.body)
    const updatedClient = await createAnamnesisVersion(context.prisma, req.currentUser.id, clientId, payload)
    const latestAnamnesis = updatedClient.anamneses?.[0] || null
    const latestPhotoRecord = latestAnamnesis?.answers?.photoRecord || {}

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_ANAMNESIS_VERSION_CREATE',
      entityType: 'Anamnesis',
      entityId: updatedClient.anamneses?.[0]?.id || null,
      metadata: {
        clientId: updatedClient.id,
        path: `/api/v2/medical-records/by-client/${updatedClient.id}/anamnesis`,
        photoConsent: {
          clinicalUseAuthorized: Boolean(latestPhotoRecord.clinicalUseAuthorized || latestPhotoRecord.imageUseAuthorized),
          marketingUseAuthorized: Boolean(latestPhotoRecord.marketingUseAuthorized || latestPhotoRecord.imageUseAuthorized),
          consentAwarenessConfirmed: Boolean(latestPhotoRecord.consentAwarenessConfirmed),
          photoCount: Array.isArray(latestPhotoRecord.photos) ? latestPhotoRecord.photos.length : 0,
          consentVersion: latestPhotoRecord.consentVersion || null,
        },
      },
    })

    res.json(buildMedicalRecord(updatedClient))
  }))

  return router
}

module.exports = {
  createMedicalRecordsRouter,
}
