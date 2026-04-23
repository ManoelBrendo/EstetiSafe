const { httpError } = require('./http')
const { ensureClientOwnership, ensureEditableClientOwnership, buildAccessState } = require('./medical-records')

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function toDateOnlyString(value) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function asPositiveInteger(value, fallback = null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function asNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function summarizeServicePop(record, serviceId) {
  if (!record) {
    return null
  }

  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    downloadName: `${record.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'pop'}.txt`,
    pdfPath: `/api/v2/pdf/service-pops/by-service/${serviceId}`,
  }
}

function serializeServiceCatalogItem(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description || null,
    duration: service.duration,
    price: service.price,
    active: service.active,
    servicePop: summarizeServicePop(service.servicePop, service.id),
  }
}

async function ensureServiceOwnership(prisma, userId, serviceId) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, userId },
    include: { servicePop: true },
  })

  if (!service) {
    throw httpError(404, 'Servico nao encontrado.')
  }

  return service
}

function buildBaseAnswersFromClient(client) {
  return {
    identification: {
      fullName: client.name || '',
      cpf: client.cpf || '',
      birthDate: toDateOnlyString(client.birthDate),
      age: null,
      sex: client.sex || '',
      maritalStatus: client.maritalStatus || '',
      profession: client.profession || '',
      phone: client.phone || '',
      email: client.email || '',
      addressFull: client.addressFull || '',
    },
    chiefComplaint: {
      desiredProcedure: '',
      currentDiscomfort: '',
      complaintDuration: '',
      previousTreatment: '',
    },
    healthHistory: {},
    lifestyle: {},
    aestheticEvaluation: {
      conditions: [],
    },
    contraindications: {},
    expectations: {},
    photoRecord: {
      photos: [],
      imageUseAuthorized: false,
    },
    treatmentPlan: {
      services: [],
    },
    scienceTerm: {},
    signatures: {},
    treatmentObjective: '',
  }
}

function getAnswersSnapshot(client) {
  const latest = client.anamneses?.[0]
  const answers = latest?.answers && typeof latest.answers === 'object'
    ? cloneJson(latest.answers)
    : buildBaseAnswersFromClient(client)

  answers.identification = {
    fullName: answers.identification?.fullName || client.name || '',
    cpf: answers.identification?.cpf || client.cpf || '',
    birthDate: answers.identification?.birthDate || toDateOnlyString(client.birthDate),
    age: answers.identification?.age ?? null,
    sex: answers.identification?.sex || client.sex || '',
    maritalStatus: answers.identification?.maritalStatus || client.maritalStatus || '',
    profession: answers.identification?.profession || client.profession || '',
    phone: answers.identification?.phone || client.phone || '',
    email: answers.identification?.email || client.email || '',
    addressFull: answers.identification?.addressFull || client.addressFull || '',
  }
  answers.chiefComplaint = answers.chiefComplaint && typeof answers.chiefComplaint === 'object'
    ? answers.chiefComplaint
    : { desiredProcedure: '', currentDiscomfort: '', complaintDuration: '', previousTreatment: '' }
  answers.treatmentPlan = answers.treatmentPlan && typeof answers.treatmentPlan === 'object'
    ? answers.treatmentPlan
    : { services: [] }

  return answers
}

function normalizeStoredService(record, index = 0) {
  return {
    id: normalizeText(record?.id) || `treatment-service-${index + 1}`,
    serviceId: asPositiveInteger(record?.serviceId),
    customServiceName: normalizeText(record?.customServiceName) || null,
    name: normalizeText(record?.name) || normalizeText(record?.customServiceName) || '',
    sessions: asPositiveInteger(record?.sessions, 1),
    description: normalizeText(record?.description),
    adverseEffects: normalizeText(record?.adverseEffects),
    sortOrder: asNonNegativeInteger(record?.sortOrder, index),
    linkedService: record?.linkedService || null,
  }
}

async function normalizeProtocolServiceInput(prisma, userId, input, index = 0) {
  let linkedService = null

  if (input.serviceId) {
    linkedService = await ensureServiceOwnership(prisma, userId, Number(input.serviceId))
  }

  const customServiceName = normalizeText(input.customServiceName)
  const explicitName = normalizeText(input.name)
  const resolvedName = customServiceName || linkedService?.name || explicitName

  if (!resolvedName) {
    throw httpError(422, 'Cada servico do protocolo precisa ter um nome valido.')
  }

  return {
    id: normalizeText(input.id) || `treatment-service-${Date.now()}-${index + 1}`,
    serviceId: linkedService?.id || null,
    customServiceName: customServiceName || null,
    name: resolvedName,
    sessions: asPositiveInteger(input.sessions, 1),
    description: normalizeText(input.description),
    adverseEffects: normalizeText(input.adverseEffects),
    sortOrder: asNonNegativeInteger(input.sortOrder, index),
    linkedService: linkedService ? serializeServiceCatalogItem(linkedService) : null,
  }
}

function sumPlannedSessions(services) {
  if (!Array.isArray(services) || !services.length) {
    return null
  }

  const total = services.reduce((sum, item) => sum + (asPositiveInteger(item.sessions, 0) || 0), 0)
  return total || null
}

function buildProtocolMeta(existingPlan, payload, services) {
  const current = existingPlan.protocol && typeof existingPlan.protocol === 'object'
    ? existingPlan.protocol
    : {}

  const protocolName = normalizeText(payload.protocolName)
    || normalizeText(current.protocolName)
    || normalizeText(existingPlan.recommendedProcedure)
    || services[0]?.name
    || 'Protocolo clinico'

  return {
    protocolName,
    treatmentObjective: payload.treatmentObjective !== undefined
      ? normalizeText(payload.treatmentObjective)
      : normalizeText(current.treatmentObjective),
    recommendations: payload.recommendations !== undefined
      ? normalizeText(payload.recommendations)
      : normalizeText(current.recommendations),
    guidelines: payload.guidelines !== undefined
      ? normalizeText(payload.guidelines)
      : normalizeText(current.guidelines),
    notes: payload.notes !== undefined
      ? normalizeText(payload.notes)
      : normalizeText(current.notes),
    status: payload.status || normalizeText(current.status) || 'draft',
    updatedAt: new Date().toISOString(),
    version: 'legacy-compat-v2',
  }
}

function buildTreatmentPlan(existingPlan, payload, services, protocolMeta) {
  return {
    ...existingPlan,
    recommendedProcedure: protocolMeta.protocolName || normalizeText(existingPlan.recommendedProcedure),
    sessionCount: payload.sessionCount ?? sumPlannedSessions(services) ?? existingPlan.sessionCount ?? null,
    sessionInterval: payload.sessionInterval !== undefined
      ? normalizeText(payload.sessionInterval)
      : normalizeText(existingPlan.sessionInterval),
    productsUsed: payload.productsUsed !== undefined
      ? normalizeText(payload.productsUsed)
      : normalizeText(existingPlan.productsUsed),
    equipmentsUsed: payload.equipmentsUsed !== undefined
      ? normalizeText(payload.equipmentsUsed)
      : normalizeText(existingPlan.equipmentsUsed),
    services,
    protocol: protocolMeta,
  }
}

function buildProtocolRecordFromAnamnesis(client, anamnesis, index = 0) {
  if (!anamnesis || !anamnesis.answers || typeof anamnesis.answers !== 'object') {
    return null
  }

  const answers = anamnesis.answers
  const treatmentPlan = answers.treatmentPlan && typeof answers.treatmentPlan === 'object'
    ? answers.treatmentPlan
    : {}
  const protocolMeta = treatmentPlan.protocol && typeof treatmentPlan.protocol === 'object'
    ? treatmentPlan.protocol
    : {}
  const services = (Array.isArray(treatmentPlan.services) ? treatmentPlan.services : [])
    .map(normalizeStoredService)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter(service => service.name || service.description || service.adverseEffects)

  const protocolName = normalizeText(protocolMeta.protocolName)
    || normalizeText(treatmentPlan.recommendedProcedure)
    || services[0]?.name
  const treatmentObjective = normalizeText(protocolMeta.treatmentObjective)
    || normalizeText(answers.treatmentObjective)
  const recommendations = normalizeText(protocolMeta.recommendations)
  const guidelines = normalizeText(protocolMeta.guidelines)
  const notes = normalizeText(protocolMeta.notes)
  const status = normalizeText(protocolMeta.status) || 'draft'

  const hasPayload = Boolean(
    protocolName
    || treatmentObjective
    || recommendations
    || guidelines
    || notes
    || services.length
    || treatmentPlan.sessionCount
    || normalizeText(treatmentPlan.sessionInterval)
    || normalizeText(treatmentPlan.productsUsed)
    || normalizeText(treatmentPlan.equipmentsUsed)
  )

  if (!hasPayload) {
    return null
  }

  return {
    id: `legacy-protocol-${client.id}-${anamnesis.id}`,
    protocolNumber: `LEG-${client.id}-${anamnesis.id}`,
    medicalRecordId: `legacy-client-${client.id}`,
    clientId: client.id,
    anamnesisId: anamnesis.id,
    source: 'legacy-anamnesis-treatment-plan',
    protocolName: protocolName || 'Protocolo clinico',
    treatmentObjective,
    recommendations,
    guidelines,
    notes,
    status,
    recommendedProcedure: normalizeText(treatmentPlan.recommendedProcedure),
    sessionCount: asPositiveInteger(treatmentPlan.sessionCount),
    sessionInterval: normalizeText(treatmentPlan.sessionInterval),
    productsUsed: normalizeText(treatmentPlan.productsUsed),
    equipmentsUsed: normalizeText(treatmentPlan.equipmentsUsed),
    services,
    createdAt: anamnesis.filledAt,
    updatedAt: anamnesis.updatedAt,
    isCurrent: index === 0,
  }
}

function buildProtocolBundle(client) {
  const history = (client.anamneses || [])
    .map((record, index) => buildProtocolRecordFromAnamnesis(client, record, index))
    .filter(Boolean)

  return {
    medicalRecordId: `legacy-client-${client.id}`,
    client: {
      id: client.id,
      fullName: client.name,
    },
    current: history[0] || null,
    history,
    accessState: buildAccessState(client),
    availableActions: {
      view: true,
      edit: !client.isLocked,
      downloadPdf: true,
    },
  }
}

async function upsertProtocolForClient(prisma, userId, clientId, payload) {
  const client = await ensureEditableClientOwnership(prisma, userId, clientId)
  const answers = getAnswersSnapshot(client)
  const existingPlan = answers.treatmentPlan && typeof answers.treatmentPlan === 'object'
    ? answers.treatmentPlan
    : {}

  const services = payload.services
    ? await Promise.all(payload.services.map((item, index) => normalizeProtocolServiceInput(prisma, userId, item, index)))
    : (Array.isArray(existingPlan.services) ? existingPlan.services : []).map(normalizeStoredService)

  const protocolMeta = buildProtocolMeta(existingPlan, payload, services)
  const nextPlan = buildTreatmentPlan(existingPlan, payload, services, protocolMeta)

  answers.treatmentPlan = nextPlan
  answers.treatmentObjective = protocolMeta.treatmentObjective || answers.treatmentObjective || ''
  answers.chiefComplaint = answers.chiefComplaint && typeof answers.chiefComplaint === 'object'
    ? answers.chiefComplaint
    : { desiredProcedure: '', currentDiscomfort: '', complaintDuration: '', previousTreatment: '' }

  if (!normalizeText(answers.chiefComplaint.desiredProcedure)) {
    answers.chiefComplaint.desiredProcedure = protocolMeta.protocolName
  }

  await prisma.anamnesis.create({
    data: {
      clientId: client.id,
      answers,
    },
  })

  return ensureClientOwnership(prisma, userId, clientId)
}

module.exports = {
  summarizeServicePop,
  serializeServiceCatalogItem,
  ensureServiceOwnership,
  buildProtocolBundle,
  upsertProtocolForClient,
}
