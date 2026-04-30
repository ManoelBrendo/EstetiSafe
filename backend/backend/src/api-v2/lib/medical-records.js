const { httpError, parseOptionalDate, sanitizeCpf, compactObject } = require('./http')

const PHOTO_CONSENT_VERSION = 'photo-consent-v1'

const clientDetailInclude = {
  anamneses: {
    orderBy: { filledAt: 'desc' },
  },
  appointments: {
    orderBy: { startAt: 'desc' },
    include: {
      service: true,
      professional: true,
      payment: true,
    },
  },
  consentRecords: {
    orderBy: { createdAt: 'desc' },
    include: {
      professional: true,
    },
  },
}

function getProntuarioLockMessage() {
  return 'Prontuário bloqueado após confirmação de pagamento. Apenas visualização dos dados e download em PDF estão disponíveis.'
}

function assertEditableClient(client) {
  if (client?.isLocked) {
    throw httpError(423, getProntuarioLockMessage())
  }
}

async function ensureClientOwnership(prisma, userId, clientId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    include: clientDetailInclude,
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado.')
  }

  return client
}

async function ensureEditableClientOwnership(prisma, userId, clientId) {
  const client = await ensureClientOwnership(prisma, userId, clientId)
  assertEditableClient(client)
  return client
}

function isImageConsentRecord(record) {
  const title = typeof record?.title === 'string' ? record.title : ''
  return title.toLowerCase().includes('uso de imagem')
}

function summarizeConsentRecord(record) {
  if (!record) {
    return null
  }

  return {
    id: record.id,
    title: record.title,
    versionLabel: record.versionLabel,
    status: record.status,
    professionalName: record.professionalName || record.professional?.name || null,
    signedAt: record.signedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function summarizePayment(payment) {
  if (!payment) {
    return null
  }

  return {
    id: payment.id,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  }
}

function summarizeAppointment(appointment) {
  return {
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    notes: appointment.notes || null,
    price: appointment.price,
    service: appointment.service ? {
      id: appointment.service.id,
      name: appointment.service.name,
      description: appointment.service.description || null,
      duration: appointment.service.duration,
      price: appointment.service.price,
    } : null,
    professional: appointment.professional ? {
      id: appointment.professional.id,
      name: appointment.professional.name,
      specialty: appointment.professional.specialty,
    } : null,
    payment: summarizePayment(appointment.payment),
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  }
}

function summarizeAnamnesis(record) {
  if (!record) {
    return null
  }

  const answers = record.answers && typeof record.answers === 'object' ? record.answers : {}
  const identification = answers.identification || {}
  const chiefComplaint = answers.chiefComplaint || {}
  const aestheticEvaluation = answers.aestheticEvaluation || {}
  const photoRecord = answers.photoRecord || {}
  const photos = Array.isArray(photoRecord.photos)
    ? photoRecord.photos
    : Array.isArray(answers.photos)
      ? answers.photos
      : []

  return {
    id: record.id,
    filledAt: record.filledAt,
    updatedAt: record.updatedAt,
    summary: {
      fullName: identification.fullName || '',
      desiredProcedure: chiefComplaint.desiredProcedure || answers.goals || '',
      mainComplaint: chiefComplaint.currentDiscomfort || answers.mainComplaint || '',
      skinType: aestheticEvaluation.skinType || answers.skinProfile || '',
      photoCount: photos.length,
      photoConsent: {
        clinicalUseAuthorized: Boolean(photoRecord.clinicalUseAuthorized || photoRecord.imageUseAuthorized),
        marketingUseAuthorized: Boolean(photoRecord.marketingUseAuthorized || photoRecord.imageUseAuthorized),
        consentVersion: photoRecord.consentVersion || null,
        consentAcceptedAt: photoRecord.consentAcceptedAt || null,
        consentAwarenessConfirmed: Boolean(photoRecord.consentAwarenessConfirmed),
      },
    },
    answers,
  }
}

function buildPhotoConsentSecurity(client) {
  const latestAnamnesis = summarizeAnamnesis(client.anamneses?.[0] || null)
  const photoSummary = latestAnamnesis?.summary || {}
  const photoConsent = photoSummary.photoConsent || {}
  const photoCount = Number(photoSummary.photoCount || 0)
  const consentRecords = Array.isArray(client.consentRecords) ? client.consentRecords : []
  const imageConsentRecord = consentRecords.find(record => isImageConsentRecord(record)) || null
  const formalConsentStatus = imageConsentRecord?.status || 'MISSING'
  const formalConsentSigned = formalConsentStatus === 'SIGNED'
  const clinicalUseAuthorized = Boolean(photoConsent.clinicalUseAuthorized)
  const marketingUseAuthorized = Boolean(photoConsent.marketingUseAuthorized)
  const consentAwarenessConfirmed = Boolean(photoConsent.consentAwarenessConfirmed)
  const needsAttention = photoCount > 0 && (!clinicalUseAuthorized || !consentAwarenessConfirmed || !formalConsentSigned)

  return {
    photoCount,
    clinicalUseAuthorized,
    marketingUseAuthorized,
    consentAwarenessConfirmed,
    consentVersion: photoConsent.consentVersion || null,
    consentAcceptedAt: photoConsent.consentAcceptedAt || null,
    formalConsentStatus,
    formalConsentId: imageConsentRecord?.id || null,
    formalConsentSignedAt: imageConsentRecord?.signedAt || null,
    needsAttention,
    message: needsAttention
      ? 'Revise o consentimento antes de usar ou divulgar imagens deste prontuario.'
      : photoCount > 0
        ? 'Fotos vinculadas com consentimento clinico e termo formal acompanhados.'
        : 'Sem fotos anexadas ao prontuario ate o momento.',
  }
}

function buildMedicalRecordSecuritySummary(client) {
  return {
    auditTrail: {
      enabled: true,
      policy: 'Abertura do prontuário, consulta de histórico sensível, alteração de anamnese, tentativa bloqueada de edição e download de PDF ficam registrados para auditoria.',
      sensitiveActions: [
        'view_medical_record',
        'view_anamnesis_history',
        'create_anamnesis_version',
        'download_medical_record_pdf',
        'manage_image_consent',
        'blocked_client_update_attempt',
      ],
    },
    accessState: buildAccessState(client),
    photoConsent: buildPhotoConsentSecurity(client),
  }
}

function buildMedicalRecordAuditMetadata(client, path, extra = {}) {
  const photoConsent = buildPhotoConsentSecurity(client)

  return {
    path,
    clientId: client.id,
    clientName: client.name,
    isPaid: Boolean(client.isPaid),
    isLocked: Boolean(client.isLocked),
    photoConsent: {
      photoCount: photoConsent.photoCount,
      clinicalUseAuthorized: photoConsent.clinicalUseAuthorized,
      marketingUseAuthorized: photoConsent.marketingUseAuthorized,
      consentAwarenessConfirmed: photoConsent.consentAwarenessConfirmed,
      formalConsentStatus: photoConsent.formalConsentStatus,
      needsAttention: photoConsent.needsAttention,
    },
    ...extra,
  }
}

function buildAccessState(client) {
  return {
    isPaid: Boolean(client?.isPaid),
    isLocked: Boolean(client?.isLocked),
    lockedAt: client?.lockedAt || null,
    lockMessage: client?.isLocked ? getProntuarioLockMessage() : null,
    readOnly: Boolean(client?.isLocked),
    allowedActions: {
      view: true,
      downloadPdf: true,
      editAnamnesis: !client?.isLocked,
      editProtocols: !client?.isLocked,
      editEvaluations: !client?.isLocked,
      editRecommendations: !client?.isLocked,
    },
  }
}

function serializeClientBase(client) {
  return {
    id: client.id,
    fullName: client.name,
    name: client.name,
    email: client.email,
    phone: client.phone,
    birthDate: client.birthDate,
    cpf: client.cpf,
    photoDataUrl: client.photoDataUrl || null,
    sex: client.sex,
    maritalStatus: client.maritalStatus,
    profession: client.profession,
    addressFull: client.addressFull,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    prontuarioStatus: buildAccessState(client),
  }
}

function serializeClientListItem(client) {
  const latestAppointment = Array.isArray(client.appointments) ? client.appointments[0] : null
  const latestAnamnesis = Array.isArray(client.anamneses) ? client.anamneses[0] : null
  const consentRecords = Array.isArray(client.consentRecords) ? client.consentRecords : []
  const latestConsent = consentRecords.find(record => !isImageConsentRecord(record)) || consentRecords[0] || null

  return {
    ...serializeClientBase(client),
    latestAnamnesis: summarizeAnamnesis(latestAnamnesis),
    latestConsentRecord: summarizeConsentRecord(latestConsent),
    consentRecords: consentRecords.map(summarizeConsentRecord),
    latestAppointment: latestAppointment ? summarizeAppointment(latestAppointment) : null,
    counts: {
      appointments: client._count?.appointments ?? client.appointments?.length ?? 0,
      anamneses: client._count?.anamneses ?? client.anamneses?.length ?? 0,
      consentRecords: client._count?.consentRecords ?? client.consentRecords?.length ?? 0,
    },
  }
}

function serializeClientDetail(client) {
  const appointments = (client.appointments || []).map(summarizeAppointment)
  const payments = appointments.map(item => item.payment).filter(Boolean)

  return {
    ...serializeClientBase(client),
    anamneses: (client.anamneses || []).map(summarizeAnamnesis),
    consentRecords: (client.consentRecords || []).map(summarizeConsentRecord),
    appointments,
    payments,
  }
}

function buildClientOverview(client) {
  const latestAppointment = client.appointments?.[0] || null
  const nextAppointment = [...(client.appointments || [])]
    .filter(item => new Date(item.startAt).getTime() >= Date.now())
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0] || null

  return {
    client: serializeClientBase(client),
    latestAnamnesis: summarizeAnamnesis(client.anamneses?.[0] || null),
    latestConsentRecord: summarizeConsentRecord(client.consentRecords?.[0] || null),
    latestAppointment: latestAppointment ? summarizeAppointment(latestAppointment) : null,
    nextAppointment: nextAppointment ? summarizeAppointment(nextAppointment) : null,
    counts: {
      appointments: client.appointments?.length || 0,
      anamneses: client.anamneses?.length || 0,
      consentRecords: client.consentRecords?.length || 0,
      paidAppointments: client.appointments?.filter(item => item.payment?.status === 'PAID').length || 0,
      pendingPayments: client.appointments?.filter(item => item.payment && item.payment.status !== 'PAID').length || 0,
    },
  }
}

function buildClientTimeline(client) {
  const items = []

  for (const record of client.anamneses || []) {
    items.push({
      type: 'anamnesis',
      occurredAt: record.updatedAt || record.filledAt,
      label: 'Anamnese registrada',
      status: client.isLocked ? 'read_only' : 'editable',
      entityId: record.id,
    })
  }

  for (const consent of client.consentRecords || []) {
    items.push({
      type: 'consent_record',
      occurredAt: consent.signedAt || consent.updatedAt || consent.createdAt,
      label: consent.title,
      status: consent.status,
      entityId: consent.id,
    })
  }

  for (const appointment of client.appointments || []) {
    items.push({
      type: 'appointment',
      occurredAt: appointment.startAt,
      label: appointment.service?.name || 'Atendimento',
      status: appointment.status,
      entityId: appointment.id,
    })

    if (appointment.payment) {
      items.push({
        type: 'payment',
        occurredAt: appointment.payment.paidAt || appointment.payment.updatedAt || appointment.payment.createdAt,
        label: `Pagamento ${appointment.payment.status}`,
        status: appointment.payment.status,
        entityId: appointment.payment.id,
      })
    }
  }

  return items
    .filter(item => Boolean(item.occurredAt))
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
}

function buildMedicalRecord(client) {
  const detail = serializeClientDetail(client)

  return {
    id: `legacy-client-${client.id}`,
    type: 'legacy-compat-medical-record',
    sourceTables: ['clients', 'anamneses', 'appointments', 'payments', 'consent_records'],
    client: detail,
    accessState: buildAccessState(client),
    security: buildMedicalRecordSecuritySummary(client),
    latestAnamnesis: detail.anamneses[0] || null,
    anamnesisHistory: detail.anamneses,
    appointments: detail.appointments,
    payments: detail.payments,
    consentRecords: detail.consentRecords,
    timeline: buildClientTimeline(client),
    pdf: {
      available: true,
      legacyPath: `/clients/${client.id}/prontuario/pdf`,
    },
  }
}

function buildMedicalRecordSummary(client) {
  const appointments = (client.appointments || []).map(summarizeAppointment)
  const payments = appointments.map(item => item.payment).filter(Boolean)

  return {
    medicalRecord: {
      id: `legacy-client-${client.id}`,
      clientId: client.id,
      isPaid: Boolean(client.isPaid),
      isLocked: Boolean(client.isLocked),
      lockedAt: client.lockedAt || null,
      source: 'legacy-client-prontuario',
    },
    client: serializeClientBase(client),
    counts: {
      anamneses: client.anamneses?.length || 0,
      appointments: appointments.length,
      payments: payments.length,
      consentRecords: client.consentRecords?.length || 0,
    },
    latestPayment: payments[0] || null,
    latestAppointment: appointments[0] || null,
    access: buildAccessState(client),
  }
}

function extractClientPatchFromAnswers(answers) {
  const identification = answers?.identification || {}

  return compactObject({
    name: identification.fullName?.trim() || undefined,
    email: identification.email?.trim() || undefined,
    phone: identification.phone?.trim() || undefined,
    birthDate: parseOptionalDate(identification.birthDate, 'identification.birthDate') || undefined,
    cpf: sanitizeCpf(identification.cpf) || undefined,
    sex: identification.sex?.trim() || undefined,
    maritalStatus: identification.maritalStatus?.trim() || undefined,
    profession: identification.profession?.trim() || undefined,
    addressFull: identification.addressFull?.trim() || undefined,
  })
}

function extractExplicitClientPatch(clientPayload = {}) {
  return compactObject({
    name: clientPayload.fullName?.trim() || clientPayload.name?.trim() || undefined,
    email: clientPayload.email?.trim() || undefined,
    phone: clientPayload.phone?.trim() || undefined,
    birthDate: parseOptionalDate(clientPayload.birthDate, 'client.birthDate') || undefined,
    cpf: sanitizeCpf(clientPayload.cpf) || undefined,
    photoDataUrl: clientPayload.photoDataUrl === null ? null : clientPayload.photoDataUrl?.trim() || undefined,
    sex: clientPayload.sex?.trim() || undefined,
    maritalStatus: clientPayload.maritalStatus?.trim() || undefined,
    profession: clientPayload.profession?.trim() || undefined,
    addressFull: clientPayload.addressFull?.trim() || undefined,
    notes: clientPayload.notes?.trim() || undefined,
  })
}

async function resolveProfessionalSignature(prisma, userId, answers) {
  const clonedAnswers = JSON.parse(JSON.stringify(answers || {}))
  const signatures = clonedAnswers.signatures && typeof clonedAnswers.signatures === 'object'
    ? clonedAnswers.signatures
    : null

  if (!signatures?.professionalId) {
    return clonedAnswers
  }

  const professionalId = Number(signatures.professionalId)
  if (!Number.isInteger(professionalId) || professionalId <= 0) {
    throw httpError(400, 'signatures.professionalId invalido.')
  }

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, userId },
    select: { id: true, name: true },
  })

  if (!professional) {
    throw httpError(404, 'Profissional informado na assinatura nao foi encontrado.')
  }

  clonedAnswers.signatures = {
    ...signatures,
    professionalId: professional.id,
    professionalName: professional.name,
  }

  return clonedAnswers
}

function normalizePhotoRecordConsent(answers) {
  const clonedAnswers = JSON.parse(JSON.stringify(answers || {}))
  const photoRecord = clonedAnswers.photoRecord && typeof clonedAnswers.photoRecord === 'object'
    ? clonedAnswers.photoRecord
    : {}
  const photos = Array.isArray(photoRecord.photos)
    ? photoRecord.photos
    : Array.isArray(clonedAnswers.photos)
      ? clonedAnswers.photos
      : []
  const legacyImageUseAuthorized = Boolean(photoRecord.imageUseAuthorized)
  const clinicalUseAuthorized = Boolean(photoRecord.clinicalUseAuthorized || legacyImageUseAuthorized)
  const marketingUseAuthorized = Boolean(photoRecord.marketingUseAuthorized || legacyImageUseAuthorized)
  const consentAwarenessConfirmed = Boolean(photoRecord.consentAwarenessConfirmed && clinicalUseAuthorized)

  if (photos.length > 0 && !clinicalUseAuthorized) {
    throw httpError(400, 'Para anexar fotos ao prontuario, registre o consentimento clinico de imagem.')
  }

  if (marketingUseAuthorized && !clinicalUseAuthorized) {
    throw httpError(400, 'O uso de imagem em marketing depende do consentimento clinico registrado no prontuario.')
  }

  if (photos.length > 0 && !consentAwarenessConfirmed) {
    throw httpError(400, 'Para anexar fotos ao prontuario, confirme que a autorizacao de imagem foi explicada e registrada.')
  }

  clonedAnswers.photoRecord = {
    ...photoRecord,
    photos,
    imageUseAuthorized: marketingUseAuthorized,
    clinicalUseAuthorized,
    marketingUseAuthorized,
    consentAwarenessConfirmed,
    consentVersion: typeof photoRecord.consentVersion === 'string' && photoRecord.consentVersion.trim()
      ? photoRecord.consentVersion.trim()
      : PHOTO_CONSENT_VERSION,
    consentAcceptedAt: clinicalUseAuthorized
      ? (photoRecord.consentAcceptedAt || new Date().toISOString())
      : null,
  }

  return clonedAnswers
}

async function createAnamnesisVersion(prisma, userId, clientId, payload) {
  const currentClient = await ensureEditableClientOwnership(prisma, userId, clientId)
  const resolvedAnswers = normalizePhotoRecordConsent(await resolveProfessionalSignature(prisma, userId, payload.answers))
  const clientPatch = {
    ...extractClientPatchFromAnswers(resolvedAnswers),
    ...extractExplicitClientPatch(payload.client || {}),
  }

  await prisma.$transaction(async tx => {
    if (Object.keys(clientPatch).length > 0) {
      await tx.client.update({
        where: { id: currentClient.id },
        data: clientPatch,
      })
    }

    await tx.anamnesis.create({
      data: {
        clientId: currentClient.id,
        answers: resolvedAnswers,
      },
    })
  })

  return ensureClientOwnership(prisma, userId, clientId)
}

module.exports = {
  getProntuarioLockMessage,
  assertEditableClient,
  ensureClientOwnership,
  ensureEditableClientOwnership,
  summarizeConsentRecord,
  summarizePayment,
  summarizeAppointment,
  summarizeAnamnesis,
  serializeClientBase,
  serializeClientListItem,
  serializeClientDetail,
  buildClientOverview,
  buildClientTimeline,
  buildMedicalRecord,
  buildMedicalRecordSummary,
  buildMedicalRecordSecuritySummary,
  buildMedicalRecordAuditMetadata,
  buildAccessState,
  normalizePhotoRecordConsent,
  createAnamnesisVersion,
}
