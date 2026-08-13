const {
  parseId,
  anamnesisSchema,
  normalizeAnamnesisData,
  ensureEditableClientOwnership,
  ensureProfessionalOwnership,
  createAuditLogFromRequest,
  getRequestClinicId,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerLegacyAnamnesisRoutes({
  app,
  prisma,
}) {

  app.get('/clients/:clientId/anamnesis', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    const client = await prisma.client.findFirstOrThrow({ where: { id: clientId, userId: req.user.id } })

    const list = await prisma.anamnesis.findMany({ where: { clientId }, orderBy: { filledAt: 'desc' } })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'MEDICAL_RECORD_ANAMNESIS_READ',
      description: `Visualizou o histórico de anamnese do paciente ${client.name || 'Sem nome'}.`,
      severity: 'LOW',
      entityType: 'Client',
      entityId: clientId,
    }).catch(err => console.error('Erro ao registrar auditoria de leitura de anamnese:', err))

    res.json(list)
  }))

  app.post('/clients/:clientId/anamnesis', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    const data = anamnesisSchema.parse(req.body)
    let normalized = normalizeAnamnesisData(data)

    await ensureEditableClientOwnership(req.user.id, clientId)

    if (normalized.answers.signatures.professionalId) {
      const professional = await ensureProfessionalOwnership(req.user.id, normalized.answers.signatures.professionalId)
      normalized = {
        ...normalized,
        answers: {
          ...normalized.answers,
          signatures: {
            ...normalized.answers.signatures,
            professionalId: professional.id,
            professionalName: professional.name,
          },
        },
      }
    }

    const anamnesis = await prisma.$transaction(async tx => {
      await tx.client.update({
        where: { id: clientId },
        data: normalized.clientData,
      })

      return tx.anamnesis.create({
        data: {
          clientId,
          answers: normalized.answers,
        },
      })
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'MEDICAL_RECORD_ANAMNESIS_CREATED',
      entityType: 'Anamnesis',
      entityId: anamnesis.id,
      metadata: {
        clientId,
        photoCount: normalized.answers.photoRecord.photos.length,
        clinicalPhotoConsent: normalized.answers.photoRecord.clinicalUseAuthorized,
        marketingPhotoConsent: normalized.answers.photoRecord.marketingUseAuthorized,
        consentAwarenessConfirmed: normalized.answers.photoRecord.consentAwarenessConfirmed,
        professionalId: normalized.answers.signatures.professionalId,
        professionalName: normalized.answers.signatures.professionalName,
      },
    })

    res.status(201).json(anamnesis)
  }))
}

module.exports = {
  registerLegacyAnamnesisRoutes,
}
