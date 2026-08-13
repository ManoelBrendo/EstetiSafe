const crypto = require('crypto')
const {
  parseId,
  httpError,
  consentRecordSchema,
  imageConsentRecordSchema,
  consentRevocationSchema,
  consentSignatureSchema,
  ensureClientOwnership,
  ensureEditableClientOwnership,
  ensureConsentRecordOwnership,
  ensureEditableConsentRecordOwnership,
  ensureProfessionalOwnership,
  buildDefaultConsentTerm,
  buildImageConsentTerm,
  renderConsentRecordPdf,
  sendPdfDocument,
  sanitizeFileName,
  createAuditLogFromRequest,
  getRequestClinicId,
  getRequestIp,
  IMAGE_CONSENT_TITLE,
  IMAGE_CONSENT_VERSION,
  summarizeConsentRecord,
  renderClientMedicalRecordPdf,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerLegacyConsentRoutes({
  app,
  prisma,
}) {

  app.get('/clients/:clientId/prontuario/pdf', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    await ensureClientOwnership(req.user.id, clientId)

    const client = await prisma.client.findFirstOrThrow({
      where: { id: clientId, userId: req.user.id },
      include: {
        appointments: {
          include: { service: true, professional: true, payment: true },
          orderBy: { startAt: 'desc' },
          take: 12,
        },
        anamneses: {
          orderBy: { filledAt: 'desc' },
          take: 1,
        },
        consentRecords: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    const filename = `${sanitizeFileName(`prontuario-${client.name}`, 'prontuario-clinico')}.pdf`

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'MEDICAL_RECORD_PDF_DOWNLOAD',
      entityType: 'Client',
      entityId: client.id,
      metadata: {
        clientId,
        path: `/clients/${clientId}/prontuario/pdf`,
        filename,
        isPaid: Boolean(client.isPaid),
        isLocked: Boolean(client.isLocked),
      },
    })

    sendPdfDocument(res, filename, doc => {
      renderClientMedicalRecordPdf(doc, {
        clinicName: req.currentUser?.clinicName,
        client,
      })
    })
  }))

  app.get('/clients/:clientId/consent-records', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    await ensureClientOwnership(req.user.id, clientId)

    const records = await prisma.consentRecord.findMany({
      where: { clientId, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORDS_READ',
      description: `Visualizou a lista de termos de consentimento do paciente ID ${clientId}.`,
      severity: 'LOW',
      entityType: 'Client',
      entityId: clientId,
      metadata: {
        clientId,
        recordCount: records.length,
      },
    }).catch(err => console.error('Erro ao registrar auditoria de leitura de lista de consentimentos:', err))

    res.json(records.map(summarizeConsentRecord))
  }))

  app.post('/clients/:clientId/consent-records/generate-default', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    const overrides = consentRecordSchema.parse(req.body || {})
    await ensureEditableClientOwnership(req.user.id, clientId)

    const [client, user, pendingRecord] = await Promise.all([
      prisma.client.findFirstOrThrow({
        where: { id: clientId, userId: req.user.id },
        select: { id: true, name: true, email: true, phone: true, cpf: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { clinicName: true },
      }),
      prisma.consentRecord.findFirst({
        where: { clientId, userId: req.user.id, status: 'PENDING', title: { not: IMAGE_CONSENT_TITLE } },
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true, cpf: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    if (pendingRecord) {
      return res.json(pendingRecord)
    }

    const record = await prisma.consentRecord.create({
      data: {
        userId: req.user.id,
        clientId,
        title: overrides.title || 'Termo de consentimento para procedimentos estéticos',
        versionLabel: overrides.versionLabel || 'v1',
        termText: buildDefaultConsentTerm({ clinicName: user.clinicName, clientName: client.name }),
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, cpf: true },
        },
      },
    })

    res.status(201).json(record)
  }))

  app.post('/clients/:clientId/consent-records/generate-image-use', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.clientId, 'clientId')
    const options = imageConsentRecordSchema.parse(req.body || {})
    await ensureEditableClientOwnership(req.user.id, clientId)

    const [client, user, pendingRecord] = await Promise.all([
      prisma.client.findFirstOrThrow({
        where: { id: clientId, userId: req.user.id },
        select: { id: true, name: true, email: true, phone: true, cpf: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { clinicName: true },
      }),
      prisma.consentRecord.findFirst({
        where: { clientId, userId: req.user.id, status: 'PENDING', title: IMAGE_CONSENT_TITLE },
        include: {
          client: {
            select: { id: true, name: true, email: true, phone: true, cpf: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    if (pendingRecord) {
      await createAuditLogFromRequest(req, {
        clinicId: getRequestClinicId(req),
        action: 'CONSENT_RECORD_IMAGE_USE_REUSE_PENDING',
        entityType: 'ConsentRecord',
        entityId: pendingRecord.id,
        metadata: {
          clientId,
          title: pendingRecord.title,
          status: pendingRecord.status,
        },
      })

      return res.json(pendingRecord)
    }

    const clinicalUseAuthorized = options.clinicalUseAuthorized !== false
    const marketingUseAuthorized = Boolean(options.marketingUseAuthorized)

    const record = await prisma.consentRecord.create({
      data: {
        userId: req.user.id,
        clientId,
        title: IMAGE_CONSENT_TITLE,
        versionLabel: IMAGE_CONSENT_VERSION,
        termText: buildImageConsentTerm({
          clinicName: user.clinicName,
          clientName: client.name,
          clinicalUseAuthorized,
          marketingUseAuthorized,
        }),
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, cpf: true },
        },
      },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORD_IMAGE_USE_GENERATE',
      entityType: 'ConsentRecord',
      entityId: record.id,
      metadata: {
        clientId,
        title: record.title,
        status: record.status,
        clinicalUseAuthorized,
        marketingUseAuthorized,
      },
    })

    res.status(201).json(record)
  }))

  app.get('/consent-records/:id', authMiddleware, handle(async (req, res) => {
    const consentRecordId = parseId(req.params.id, 'consentRecordId')
    const record = await ensureConsentRecordOwnership(req.user.id, consentRecordId)

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORD_READ',
      description: `Visualizou os detalhes do termo de consentimento "${record.title}" do paciente ID ${record.clientId}.`,
      severity: 'LOW',
      entityType: 'ConsentRecord',
      entityId: record.id,
      metadata: {
        clientId: record.clientId,
        title: record.title,
        status: record.status,
      },
    }).catch(err => console.error('Erro ao registrar auditoria de leitura de consentimento:', err))

    res.json(record)
  }))

  app.get('/consent-records/:id/pdf', authMiddleware, handle(async (req, res) => {
    const consentRecordId = parseId(req.params.id, 'consentRecordId')
    const record = await ensureConsentRecordOwnership(req.user.id, consentRecordId)
    const filename = `${sanitizeFileName(`${record.title}-${record.client.name}`, 'termo-consentimento')}.pdf`

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORD_PDF_DOWNLOAD',
      entityType: 'ConsentRecord',
      entityId: record.id,
      metadata: {
        clientId: record.clientId,
        title: record.title,
        status: record.status,
        filename,
      },
    })

    sendPdfDocument(res, filename, doc => {
      renderConsentRecordPdf(doc, {
        clinicName: req.currentUser?.clinicName,
        record,
      })
    })
  }))

  app.post('/consent-records/:id/revoke', authMiddleware, handle(async (req, res) => {
    const consentRecordId = parseId(req.params.id, 'consentRecordId')
    const data = consentRevocationSchema.parse(req.body || {})
    const record = await ensureConsentRecordOwnership(req.user.id, consentRecordId)

    if (record.status === 'REVOKED') {
      throw httpError(409, 'Este termo ja foi revogado')
    }

    const revokedAt = new Date()
    const updatedRecord = await prisma.consentRecord.update({
      where: { id: consentRecordId },
      data: {
        status: 'REVOKED',
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, cpf: true },
        },
      },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORD_REVOKE',
      entityType: 'ConsentRecord',
      entityId: updatedRecord.id,
      metadata: {
        clientId: updatedRecord.clientId,
        title: updatedRecord.title,
        previousStatus: record.status,
        nextStatus: updatedRecord.status,
        reason: data.reason?.trim() || null,
        revokedAt: revokedAt.toISOString(),
        signedAt: record.signedAt,
      },
    })

    res.json(updatedRecord)
  }))

  app.post('/consent-records/:id/sign', authMiddleware, handle(async (req, res) => {
    const consentRecordId = parseId(req.params.id, 'consentRecordId')
    const data = consentSignatureSchema.parse(req.body)
    const record = await ensureEditableConsentRecordOwnership(req.user.id, consentRecordId)

    if (record.status === 'SIGNED') {
      throw httpError(409, 'Este termo já foi assinado')
    }

    if (record.status === 'REVOKED') {
      throw httpError(409, 'Este termo foi revogado e precisa ser regenerado')
    }

    let professionalId = null
    let professionalName = data.professionalName?.trim() || null

    if (data.professionalId) {
      const professional = await ensureProfessionalOwnership(req.user.id, data.professionalId)
      professionalId = professional.id
      professionalName = professional.name
    }

    const signedAt = new Date()
    const signatureHash = crypto
      .createHash('sha256')
      .update([
        record.id,
        record.clientId,
        record.termText,
        data.signerName.trim(),
        professionalName || '',
        data.signatureDataUrl,
        signedAt.toISOString(),
      ].join('|'))
      .digest('hex')

    const updatedRecord = await prisma.consentRecord.update({
      where: { id: consentRecordId },
      data: {
        signerName: data.signerName.trim(),
        signerDocument: data.signerDocument?.trim() || record.client.cpf || null,
        professionalId,
        professionalName,
        signatureDataUrl: data.signatureDataUrl,
        signatureHash,
        signedAt,
        signedIp: getRequestIp(req),
        signedUserAgent: req.get('user-agent') || null,
        status: 'SIGNED',
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, cpf: true },
        },
      },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CONSENT_RECORD_SIGN',
      entityType: 'ConsentRecord',
      entityId: updatedRecord.id,
      metadata: {
        clientId: updatedRecord.clientId,
        title: updatedRecord.title,
        status: updatedRecord.status,
        signedAt: updatedRecord.signedAt,
        professionalId: updatedRecord.professionalId,
        professionalName: updatedRecord.professionalName,
      },
    })

    res.json(updatedRecord)
  }))
}

module.exports = {
  registerLegacyConsentRoutes,
}
