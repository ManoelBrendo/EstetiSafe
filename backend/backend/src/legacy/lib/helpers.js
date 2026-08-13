const { z } = require('zod')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const PDFDocument = require('pdfkit')
const prisma = require('./prisma')

const { passwordPolicyMessage, passwordMeetsPolicy, safeEqualText } = require('../../../lib/security')
const { hasSupportBillingControl } = require('../../../lib/supportAccess')
const { getAuditActorData } = require('../../../lib/supportAudit')

const clinicOperationalScopeCatalog = {
  FACIAL: {
    label: 'Estética facial',
    requirements: {
      CLIENTS: ['Ficha de avaliação facial', 'Termo de uso de imagem antes/depois'],
      SANITARY: ['POP de higienização facial'],
    },
  },
  INJECTABLES: {
    label: 'Injetáveis e minimamente invasivos',
    requirements: {
      CLIENTS: ['Termo específico para injetáveis', 'Ficha de contraindicações para injetáveis'],
      SANITARY: ['Registro do responsável técnico para injetáveis', 'POP de intercorrência com injetáveis'],
    },
  },
  LASER: {
    label: 'Laser e tecnologias',
    requirements: {
      CLIENTS: ['Termo de consentimento para laser e fototerapia'],
      SANITARY: ['Manual do equipamento laser', 'Treinamento de segurança em laser'],
      LEGAL: ['Contrato de manutenção ou calibração de equipamentos'],
    },
  },
  BODY: {
    label: 'Procedimentos corporais',
    requirements: {
      CLIENTS: ['Ficha de avaliação corporal', 'Registro de medidas e evolução corporal'],
      SANITARY: ['POP de limpeza de ponteiras e acessórios'],
    },
  },
  ADVANCED: {
    label: 'Protocolos avançados',
    requirements: {
      CLIENTS: ['Termo de ciência de riscos e limitações'],
      SANITARY: ['POP de intercorrências e eventos adversos', 'Plano de emergência clínica'],
    },
  },
}

function getDocumentStatus(expiresAt) {
  if (!expiresAt) {
    return {
      status: 'WITHOUT_EXPIRY',
      label: 'Sem vencimento',
      daysUntilExpiry: null,
    }
  }

  const now = new Date()
  const expiresAtEndOfDay = new Date(expiresAt)

  if (Number.isNaN(expiresAtEndOfDay.getTime())) {
    return {
      status: 'WITHOUT_EXPIRY',
      label: 'Data inválida',
      daysUntilExpiry: null,
    }
  }

  expiresAtEndOfDay.setHours(23, 59, 59, 999)

  const daysUntilExpiry = Math.ceil((expiresAtEndOfDay.getTime() - now.getTime()) / 86400000)

  if (daysUntilExpiry < 0) {
    return {
      status: 'EXPIRED',
      label: 'Vencido',
      daysUntilExpiry,
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      status: 'EXPIRING',
      label: `Vence em ${daysUntilExpiry} dia(s)`,
      daysUntilExpiry,
    }
  }

  return {
    status: 'VALID',
    label: 'Em dia',
    daysUntilExpiry,
  }
}

function hasSupportCredentials({ supportAdminEmail, supportAdminPassword }) {
  return Boolean(supportAdminEmail && supportAdminPassword)
}

function getSupportContact({
  supportContactName,
  supportContactEmail,
  supportContactPhone,
}) {
  return {
    name: supportContactName,
    email: supportContactEmail,
    phone: supportContactPhone,
  }
}

function getSupportBillingSnapshot() {
  return {
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    blocked: false,
    amount: null,
    reference: null,
    notes: null,
    graceEndsAt: null,
    lastPaidAt: null,
    nextDueAt: null,
    blockAt: null,
    daysRemaining: null,
    message: 'Acesso técnico liberado para manutenção, diagnóstico e suporte.',
  }
}

function buildSupportUser({
  supportAdminEmail,
  supportAdminName,
}) {
  return {
    id: 0,
    email: supportAdminEmail,
    clinicName: supportAdminName,
    clinicLogoDataUrl: null,
    role: 'SUPPORT',
    createdAt: new Date(0),
  }
}

function isSupportPayload(payload, supportAdminEmail) {
  return Boolean(payload?.support === true && payload?.role === 'SUPPORT' && payload?.email === supportAdminEmail)
}

function createSupportLoginResponse({
  email,
  password,
  supportAdminEmail,
  supportAdminPassword,
  supportAdminName,
  safeEqualText,
  signToken,
  serializeSupportUser,
}) {
  if (!hasSupportCredentials({ supportAdminEmail, supportAdminPassword }) || email !== supportAdminEmail) {
    return null
  }

  const passwordMatches = safeEqualText(password, supportAdminPassword)

  if (!passwordMatches) {
    return {
      status: 401,
      body: { error: 'Credenciais invalidas.' },
    }
  }

  const token = signToken({
    support: true,
    role: 'SUPPORT',
    email: supportAdminEmail,
    supportName: supportAdminName,
  })

  return {
    status: 200,
    body: {
      token,
      user: serializeSupportUser(),
    },
  }
}


const JWT_SECRET = process.env.JWT_SECRET

const SUPPORT_ADMIN_EMAIL = (process.env.SUPPORT_ADMIN_EMAIL || '').trim().toLowerCase()
const SUPPORT_ADMIN_PASSWORD = process.env.SUPPORT_ADMIN_PASSWORD || ''
const SUPPORT_ADMIN_NAME = (process.env.SUPPORT_ADMIN_NAME || 'Central de suporte').trim()
const SUPPORT_CONTACT_NAME = (process.env.SUPPORT_CONTACT_NAME || SUPPORT_ADMIN_NAME || "Suporte L'Appui").trim()
const SUPPORT_CONTACT_EMAIL = (process.env.SUPPORT_CONTACT_EMAIL || SUPPORT_ADMIN_EMAIL || '').trim()
const SUPPORT_CONTACT_PHONE = (process.env.SUPPORT_CONTACT_PHONE || '').trim()

// Schemas & Lists
const emailField = z.string().trim().email()
const appointmentStatusSchema = z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
const paymentStatusSchema = z.enum(['PENDING', 'PAID', 'REFUNDED', 'CANCELLED'])
const consentStatusSchema = z.enum(['PENDING', 'SIGNED', 'REVOKED'])
const auditCorrectiveActionStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED'])
const professionalContractTypeSchema = z.enum(['CLT', 'PJ', 'AUTONOMA', 'COMISSIONADA', 'PARCERIA'])
const professionalPaymentModelSchema = z.enum(['FIXED', 'COMMISSION', 'HYBRID', 'DAILY'])
const professionalDocumentCategorySchema = z.enum(['CONTRACT', 'CERTIFICATION', 'COUNCIL', 'TRAINING', 'PERMISSION'])

const professionalWeekdayLabels = {
  MONDAY: 'Segunda',
  TUESDAY: 'Terça',
  WEDNESDAY: 'Quarta',
  THURSDAY: 'Quinta',
  FRIDAY: 'Sexta',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
}

const professionalWeekdays = Object.keys(professionalWeekdayLabels)

const professionalContractTypeLabels = {
  CLT: 'CLT',
  PJ: 'PJ',
  AUTONOMA: 'Autônoma',
  COMISSIONADA: 'Comissionada',
  PARCERIA: 'Parceria',
}

const professionalPaymentModelLabels = {
  FIXED: 'Fixo',
  COMMISSION: 'Comissão',
  HYBRID: 'Fixo + comissão',
  DAILY: 'Diária',
}

const professionalDocumentCategoryLabels = {
  CONTRACT: 'Vinculo',
  CERTIFICATION: 'Certificacao',
  COUNCIL: 'Registro profissional',
  TRAINING: 'Treinamento',
  PERMISSION: 'Permissoes e dados',
}

const professionalDocumentRequirementCatalog = [
  {
    category: 'CONTRACT',
    requirement: 'Contrato ou termo de vinculo',
    keywords: ['contrato', 'vinculo', 'prestacao', 'termo'],
  },
  {
    category: 'CERTIFICATION',
    requirement: 'Certificado de formacao ou especializacao',
    keywords: ['certificado', 'formacao', 'especializacao', 'curso'],
  },
  {
    category: 'COUNCIL',
    requirement: 'Registro profissional ou conselho quando aplicavel',
    keywords: ['registro', 'conselho', 'crbm', 'crm', 'coren', 'crefito', 'crf'],
  },
  {
    category: 'TRAINING',
    requirement: 'Treinamento interno e biosseguranca',
    keywords: ['treinamento', 'biosseguranca', 'seguranca', 'manual'],
  },
  {
    category: 'PERMISSION',
    requirement: 'Termo de confidencialidade, LGPD e acesso a dados',
    keywords: ['confidencialidade', 'lgpd', 'dados', 'acesso', 'permissao'],
  },
]

const userAggregateInclude = {
  ownedClinic: {
    include: {
      subscription: true,
    },
  },
}

const auditCorrectiveActionAttachmentSelect = {
  id: true,
  actionId: true,
  fileName: true,
  fileMimeType: true,
  notes: true,
  createdAt: true,
}

const auditCorrectiveActionInclude = {
  attachments: {
    orderBy: { createdAt: 'desc' },
    select: auditCorrectiveActionAttachmentSelect,
  },
}

// Helpers
function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str
  if (str.startsWith('data:')) return str // Skip base64 file data URLs
  return str
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim()
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key]
      if (typeof val === 'string') {
        obj[key] = sanitizeString(val)
      } else if (typeof val === 'object' && val !== null) {
        sanitizeObject(val)
      }
    }
  }
  return obj
}

function decimalEqual(left, right) {
  const leftValue = left === null || left === undefined ? null : String(left)
  const rightValue = right === null || right === undefined ? null : String(right)
  return leftValue === rightValue
}

function mapBillingStatusToClinicStatus(status) {
  return status === 'BLOCKED' ? 'SUSPENDED' : 'ACTIVE'
}

function buildClinicAggregateSeed(user) {
  const status = user.billingStatus || 'TRIAL'
  const graceEndsAt = user.billingGraceEndsAt || addDays(user.createdAt || new Date(), 7)

  return {
    clinic: {
      name: user.clinicName,
      logoDataUrl: user.clinicLogoDataUrl || null,
      status: mapBillingStatusToClinicStatus(status),
    },
    subscription: {
      status,
      amount: user.billingAmount ?? null,
      graceEndsAt,
      lastPaidAt: user.billingLastPaidAt ?? null,
      nextDueAt: user.billingNextDueAt ?? null,
      reference: user.billingReference ?? null,
      notes: user.billingNotes ?? null,
    },
  }
}

function mergeLegacyUserAggregate(user) {
  if (!user || user.ownedClinic) {
    return user
  }

  const seed = buildClinicAggregateSeed(user)
  return {
    ...user,
    ownedClinic: {
      id: null,
      ownerUserId: user.id,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      ...seed.clinic,
      subscription: {
        id: null,
        clinicId: null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...seed.subscription,
      },
    },
  }
}

async function ensureClinicAggregate(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userAggregateInclude,
  })

  if (!user) {
    throw httpError(401, 'Conta nao encontrada')
  }

  const seed = buildClinicAggregateSeed(user)

  if (!user.ownedClinic) {
    await prisma.clinic.create({
      data: {
        ownerUserId: user.id,
        ...seed.clinic,
        subscription: {
          create: seed.subscription,
        },
      },
    })
  } else {
    const clinicUpdate = {}
    if (user.ownedClinic.name !== seed.clinic.name) clinicUpdate.name = seed.clinic.name
    if ((user.ownedClinic.logoDataUrl || null) !== seed.clinic.logoDataUrl) clinicUpdate.logoDataUrl = seed.clinic.logoDataUrl
    if (user.ownedClinic.status !== seed.clinic.status) clinicUpdate.status = seed.clinic.status

    const subscription = user.ownedClinic.subscription
    const shouldSyncSubscription = !subscription
      || subscription.status !== seed.subscription.status
      || !decimalEqual(subscription.amount, seed.subscription.amount)
      || String(subscription.graceEndsAt || '') !== String(seed.subscription.graceEndsAt || '')
      || String(subscription.lastPaidAt || '') !== String(seed.subscription.lastPaidAt || '')
      || String(subscription.nextDueAt || '') !== String(seed.subscription.nextDueAt || '')
      || (subscription.reference || null) !== seed.subscription.reference
      || (subscription.notes || null) !== seed.subscription.notes

    if (Object.keys(clinicUpdate).length > 0 || shouldSyncSubscription) {
      await prisma.clinic.update({
        where: { id: user.ownedClinic.id },
        data: {
          ...clinicUpdate,
          ...(shouldSyncSubscription
            ? {
              subscription: {
                upsert: {
                  create: seed.subscription,
                  update: seed.subscription,
                },
              },
            }
            : {}),
        },
      })
    }
  }

  const hydrated = await prisma.user.findUnique({
    where: { id: userId },
    include: userAggregateInclude,
  })

  return mergeLegacyUserAggregate(hydrated)
}

function getRequestClinicId(req) {
  return req.currentUser?.ownedClinic?.id || req.currentUser?.clinicId || null
}

function getScopedRequestUserId(req) {
  return req.currentUser?.id || req.user?.id
}

function getAuditCorrectiveUserId(req) {
  const userId = getScopedRequestUserId(req)

  if (!userId || userId <= 0) {
    throw httpError(409, 'Selecione uma clínica na central de suporte para acompanhar o plano corretivo.')
  }

  return userId
}

const { signAuditLog } = require('../../api-v2/lib/auditChaining')

async function createAuditLog(entry) {
  const payload = {
    clinicId: entry.clinicId ?? null,
    actorUserId: entry.actorUserId ?? null,
    actorEmail: entry.actorEmail ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
    metadata: entry.metadata ?? null,
  }

  const signed = await signAuditLog(prisma, payload)

  return prisma.auditLog.create({
    data: signed,
  })
}

async function createAuditLogFromRequest(req, entry) {
  return createAuditLog({
    ...entry,
    ...getAuditActorData(req),
  })
}

function serializeAuditLog(log) {
  return {
    id: log.id,
    clinicId: log.clinicId,
    actorUserId: log.actorUserId,
    actorEmail: log.actorEmail,
    actorRole: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata,
    createdAt: log.createdAt,
  }
}

function serializeAuditCorrectiveActionAttachment(attachment) {
  return {
    id: attachment.id,
    actionId: attachment.actionId,
    fileName: attachment.fileName,
    fileMimeType: attachment.fileMimeType,
    notes: attachment.notes,
    createdAt: attachment.createdAt,
  }
}

function serializeAuditCorrectiveActionAttachmentFile(attachment) {
  return {
    ...serializeAuditCorrectiveActionAttachment(attachment),
    fileDataUrl: attachment.fileDataUrl,
  }
}

function serializeAuditCorrectiveAction(action) {
  return {
    id: action.id,
    taskKey: action.taskKey,
    domainId: action.domainId,
    domainTitle: action.domainTitle,
    title: action.title,
    owner: action.owner,
    dueLabel: action.dueLabel,
    dueAt: action.dueAt,
    evidence: action.evidence,
    actionUrl: action.actionUrl,
    riskLevel: action.riskLevel,
    status: action.status,
    completedAt: action.completedAt,
    dismissedAt: action.dismissedAt,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    attachments: (action.attachments || []).map(serializeAuditCorrectiveActionAttachment),
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' })
}

function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function parseId(value, fieldName = 'id') {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} inválido.`)
  }
  return parsed
}

function parseDateTime(value, fieldName) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw httpError(422, `${fieldName} inválido.`)
  }
  return date
}

function parseDateOnly(value, fieldName) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw httpError(422, `${fieldName} inválido.`)
  }
  return date
}

function toDateOnlyIso(date) {
  return date ? date.toISOString().slice(0, 10) : null
}

function sanitizeCpf(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

function calculateAgeFromDate(date) {
  if (!date) return null
  const today = new Date()
  let age = today.getUTCFullYear() - date.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - date.getUTCMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < date.getUTCDate())) {
    age -= 1
  }
  return Math.max(age, 0)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function isTimeLabel(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function parseDecimalValue(value, fieldName) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw httpError(422, `${fieldName} inválido.`)
  }
  return parsed
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || null
}

function buildDefaultConsentTerm({ clinicName, clientName }) {
  return [
    `Eu, ${clientName}, declaro que fui orientado(a) pela equipe da ${clinicName} sobre o atendimento estético proposto, seus objetivos, possíveis desconfortos, cuidados e riscos esperados.`,
    '',
    'Confirmo que informei com veracidade meu histórico de saúde, alergias, medicamentos em uso, procedimentos anteriores e demais informações relevantes para a segurança do atendimento.',
    '',
    'Autorizo a realização do procedimento conforme avaliação profissional e compreendo que posso interromper ou solicitar esclarecimentos a qualquer momento.',
    '',
    'Estou ciente de que resultados variam conforme características individuais, adesão às orientações e resposta biológica ao tratamento.',
    '',
    'Autorizo o registro destas informações no prontuário da clínica para fins assistenciais, legais e de rastreabilidade.',
    '',
    'Li o conteúdo acima, tive oportunidade de tirar dúvidas e declaro meu consentimento livre e esclarecido.',
  ].join('\n')
}

const IMAGE_CONSENT_TITLE = 'Termo de autorização de uso de imagem'
const IMAGE_CONSENT_VERSION = 'imagem-v1'

function buildImageConsentTerm({ clinicName, clientName, clinicalUseAuthorized = true, marketingUseAuthorized = false }) {
  const resolvedClinicName = clinicName || "L'Appui"
  const resolvedClientName = clientName || 'cliente'
  const clinicalDecision = clinicalUseAuthorized
    ? 'AUTORIZO o registro, armazenamento e uso das minhas imagens exclusivamente para acompanhamento clínico, evolução do tratamento, prontuário e documentação técnica interna.'
    : 'NÃO AUTORIZO o uso das minhas imagens para acompanhamento clínico, salvo quando exigido por obrigação legal ou regulatória.'
  const marketingDecision = marketingUseAuthorized
    ? 'AUTORIZO também o uso das imagens para comunicação institucional, portfólio, redes sociais e materiais de divulgação da clínica, desde que respeitados dignidade, contexto e privacidade.'
    : 'NÃO AUTORIZO o uso das minhas imagens em marketing, redes sociais, anúncios, portfólio público ou qualquer divulgação externa.'

  return [
    'Eu, ' + resolvedClientName + ', declaro que recebi explicação clara da ' + resolvedClinicName + ' sobre o uso de imagens no contexto do atendimento estético.',
    '',
    '1. Uso clínico e prontuário',
    clinicalDecision,
    '',
    '2. Uso externo, divulgação e marketing',
    marketingDecision,
    '',
    '3. Guarda, sigilo e segurança',
    'As imagens devem permanecer vinculadas ao prontuário da cliente, com acesso restrito aos profissionais autorizados e registro de finalidade.',
    '',
    '4. Revogação',
    'A cliente pode solicitar a revogação futura desta autorização. A revogação não altera registros clínicos já produzidos de forma legítima, mas impede novos usos não autorizados.',
    '',
    '5. Ciência',
    'Declaro que li, compreendi e assino este termo de forma livre, consciente e informada.',
    '',
    'Clínica responsável: ' + resolvedClinicName + '.',
    'Versão do termo: ' + IMAGE_CONSENT_VERSION + '.',
  ].join('\n')
}

function summarizeConsentRecord(record) {
  if (!record) return null
  return {
    id: record.id,
    title: record.title,
    versionLabel: record.versionLabel,
    status: record.status,
    createdAt: record.createdAt,
    signedAt: record.signedAt,
    professionalId: record.professionalId || null,
    professionalName: record.professionalName || null,
    signatureHash: record.signatureHash || null,
  }
}

function summarizeAnamnesis(record) {
  if (!record) return null
  const answers = record.answers || {}
  const identification = answers.identification || {}
  const chiefComplaint = answers.chiefComplaint || {}
  const photoRecord = answers.photoRecord || {}
  const legacyPhotos = Array.isArray(answers.photos) ? answers.photos : []
  const photos = Array.isArray(photoRecord.photos) ? photoRecord.photos : legacyPhotos

  return {
    id: record.id,
    filledAt: record.filledAt,
    updatedAt: record.updatedAt,
    fullName: identification.fullName || '',
    desiredProcedure: chiefComplaint.desiredProcedure || answers.goals || '',
    mainComplaint: chiefComplaint.currentDiscomfort || answers.mainComplaint || '',
    skinProfile: answers.aestheticEvaluation?.skinType || answers.skinProfile || '',
    photoCount: photos.length,
  }
}

function normalizeProfessionalAvailability(availability) {
  if (!Array.isArray(availability)) return null
  const mapped = availability
    .filter(slot => slot && professionalWeekdays.includes(slot.day))
    .map(slot => {
      const enabled = Boolean(slot.enabled)
      const start = enabled && isTimeLabel(slot.start) ? slot.start : '09:00'
      const end = enabled && isTimeLabel(slot.end) ? slot.end : '18:00'
      return { day: slot.day, enabled, start, end }
    })

  const ordered = professionalWeekdays.map(day => (
    mapped.find(slot => slot.day === day) || { day, enabled: false, start: '09:00', end: '18:00' }
  ))
  return ordered
}

function buildAvailabilitySummary(availability) {
  const normalized = normalizeProfessionalAvailability(availability) || []
  const activeDays = normalized.filter(slot => slot.enabled)
  if (!activeDays.length) {
    return 'Disponibilidade ainda não configurada.'
  }
  return activeDays
    .map(slot => `${professionalWeekdayLabels[slot.day]} ${slot.start} às ${slot.end}`)
    .join(' | ')
}

function buildProfessionalCompensationSummary(record) {
  if (!record?.paymentModel && !record?.salaryAmount && !record?.commissionRate) {
    return 'Folha de pagamento ainda não configurada.'
  }
  const parts = []
  if (record.paymentModel) {
    parts.push(professionalPaymentModelLabels[record.paymentModel] || record.paymentModel)
  }
  if (record.salaryAmount != null) {
    parts.push(`Base ${Number(record.salaryAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  }
  if (record.commissionRate != null) {
    parts.push(`Comissão ${Number(record.commissionRate).toLocaleString('pt-BR')}%`)
  }
  if (record.payrollBonusAmount != null && Number(record.payrollBonusAmount) > 0) {
    parts.push(`Bônus ${Number(record.payrollBonusAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  }
  if (record.payrollDiscountAmount != null && Number(record.payrollDiscountAmount) > 0) {
    parts.push(`Desconto ${Number(record.payrollDiscountAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  }
  if (record.paymentDay != null) {
    parts.push(`Repasse dia ${record.paymentDay}`)
  }
  return parts.join(' • ')
}

function buildProfessionalPayrollMetrics({ professional, appointments }) {
  const paidAppointments = appointments.filter(appointment => appointment.payment?.status === 'PAID')
  const completedAppointments = appointments.filter(appointment => appointment.status === 'COMPLETED')
  const uniqueWorkedDays = new Set(
    completedAppointments.map(appointment => new Date(appointment.startAt).toISOString().slice(0, 10))
  )

  const paidRevenue = paidAppointments.reduce((total, appointment) => (
    total + Number(appointment.payment?.amount || appointment.price || 0)
  ), 0)

  const fixedAmount = Number(professional.salaryAmount || 0)
  const commissionRate = Number(professional.commissionRate || 0)
  const bonusAmount = Number(professional.payrollBonusAmount || 0)
  const discountAmount = Number(professional.payrollDiscountAmount || 0)
  const commissionAmount = Number(((paidRevenue * commissionRate) / 100).toFixed(2))
  const workedDays = uniqueWorkedDays.size

  let grossPayout = 0
  switch (professional.paymentModel) {
    case 'FIXED':
      grossPayout = fixedAmount
      break
    case 'COMMISSION':
      grossPayout = commissionAmount
      break
    case 'HYBRID':
      grossPayout = fixedAmount + commissionAmount
      break
    case 'DAILY':
      grossPayout = fixedAmount * workedDays
      break
    default:
      grossPayout = fixedAmount || commissionAmount
      break
  }

  const netPayout = Math.max(0, grossPayout + bonusAmount - discountAmount)
  const latestPaidRecord = paidAppointments
    .map(appointment => appointment.payment)
    .filter(Boolean)
    .sort((left, right) => new Date(right.paidAt || 0) - new Date(left.paidAt || 0))[0]

  return {
    paidAppointments: paidAppointments.length,
    completedAppointments: completedAppointments.length,
    workedDays,
    paidRevenue: Number(paidRevenue.toFixed(2)),
    commissionRate,
    commissionAmount,
    fixedAmount: Number(fixedAmount.toFixed(2)),
    bonusAmount: Number(bonusAmount.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    grossPayout: Number(grossPayout.toFixed(2)),
    projectedPayout: Number(netPayout.toFixed(2)),
    lastPaidAt: latestPaidRecord?.paidAt || null,
  }
}

function normalizeProfessionalDocumentLookupValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findMatchingProfessionalDocumentForRequirement(requirementItem, documents) {
  const normalizedRequirement = normalizeProfessionalDocumentLookupValue(requirementItem.requirement)
  const requirementTokens = normalizedRequirement.split(' ').filter(token => token.length > 3)
  const keywords = requirementItem.keywords || []

  return documents.find(document => {
    if (document.category !== requirementItem.category) return false

    const candidate = normalizeProfessionalDocumentLookupValue([
      document.documentType,
      document.title,
      document.fileName,
      document.notes,
    ].filter(Boolean).join(' '))

    if (!candidate) return false
    if (candidate.includes(normalizedRequirement) || normalizedRequirement.includes(candidate)) return true
    if (keywords.some(keyword => candidate.includes(keyword))) return true

    const matchedTokens = requirementTokens.filter(token => candidate.includes(token)).length
    return requirementTokens.length ? matchedTokens / requirementTokens.length >= 0.45 : false
  }) || null
}

function getProfessionalDocumentRequirementScore(status) {
  if (status === 'VALID' || status === 'WITHOUT_EXPIRY') return 1
  if (status === 'EXPIRING') return 0.5
  if (status === 'EXPIRED') return 0.15
  return 0
}

function summarizeProfessionalDocument(record) {
  if (!record) return null
  const computedStatus = getDocumentStatus(record.expiresAt)

  return {
    id: record.id,
    professionalId: record.professionalId,
    professionalName: record.professional?.name || null,
    professionalSpecialty: record.professional?.specialty || null,
    category: record.category,
    categoryLabel: professionalDocumentCategoryLabels[record.category] || record.category,
    documentType: record.documentType,
    title: record.title,
    notes: record.notes,
    expiresAt: record.expiresAt,
    fileName: record.fileName,
    fileMimeType: record.fileMimeType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: computedStatus.status,
    statusLabel: computedStatus.label,
    daysUntilExpiry: computedStatus.daysUntilExpiry,
  }
}

function buildProfessionalDocumentsDashboard(professionals = [], documents = []) {
  const activeProfessionals = (Array.isArray(professionals) ? professionals : [])
    .filter(professional => professional && professional.active !== false)
  const summarized = (Array.isArray(documents) ? documents : [])
    .map(summarizeProfessionalDocument)
    .filter(Boolean)

  const documentsByProfessional = new Map()
  summarized.forEach(document => {
    const current = documentsByProfessional.get(document.professionalId) || []
    current.push(document)
    documentsByProfessional.set(document.professionalId, current)
  })

  const byProfessional = activeProfessionals.map(professional => {
    const professionalDocuments = documentsByProfessional.get(professional.id) || []
    const requirementStatuses = professionalDocumentRequirementCatalog.map((requirementItem, index) => {
      const matchedDocument = findMatchingProfessionalDocumentForRequirement(requirementItem, professionalDocuments)
      const status = matchedDocument?.status || 'MISSING'

      return {
        id: `${professional.id}-${requirementItem.category}-${index}`,
        professionalId: professional.id,
        professionalName: professional.name,
        professionalSpecialty: professional.specialty,
        category: requirementItem.category,
        categoryLabel: professionalDocumentCategoryLabels[requirementItem.category] || requirementItem.category,
        requirement: requirementItem.requirement,
        status,
        statusLabel: matchedDocument
          ? (status === 'EXPIRED' ? 'Vencido' : matchedDocument.statusLabel)
          : 'Faltando',
        matchedDocumentId: matchedDocument?.id || null,
        matchedTitle: matchedDocument?.title || null,
        daysUntilExpiry: matchedDocument?.daysUntilExpiry ?? null,
      }
    })

    const requiredCount = requirementStatuses.length
    const coveredCount = requirementStatuses.filter(item => item.status !== 'MISSING').length
    const missingRequirements = requirementStatuses.filter(item => item.status === 'MISSING')
    const expiredCount = requirementStatuses.filter(item => item.status === 'EXPIRED').length
    const expiringCount = requirementStatuses.filter(item => item.status === 'EXPIRING').length
    const scoreValue = requirementStatuses.reduce((total, item) => total + getProfessionalDocumentRequirementScore(item.status), 0)

    return {
      professionalId: professional.id,
      professionalName: professional.name,
      professionalSpecialty: professional.specialty,
      requiredCount,
      coveredCount,
      missingCount: missingRequirements.length,
      expiringCount,
      expiredCount,
      criticalCount: missingRequirements.length + expiredCount + expiringCount,
      score: requiredCount ? Math.round((scoreValue / requiredCount) * 100) : 100,
      missingRequirements,
      documents: professionalDocuments,
    }
  })

  const missingRequirements = byProfessional.flatMap(item => item.missingRequirements)
  const alerts = summarized
    .filter(document => document.status === 'EXPIRING' || document.status === 'EXPIRED')
    .sort((left, right) => {
      const leftScore = left.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER
      const rightScore = right.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER
      return leftScore - rightScore
    })
    .slice(0, 8)
  const requiredCount = byProfessional.reduce((total, item) => total + item.requiredCount, 0)
  const coveredCount = byProfessional.reduce((total, item) => total + item.coveredCount, 0)
  const scoreValue = byProfessional.reduce((total, item) => total + item.score, 0)

  return {
    activeProfessionals: activeProfessionals.length,
    totalDocuments: summarized.length,
    requiredCount,
    coveredCount,
    missingCount: missingRequirements.length,
    expiring: summarized.filter(document => document.status === 'EXPIRING').length,
    expired: summarized.filter(document => document.status === 'EXPIRED').length,
    complianceScore: byProfessional.length ? Math.round(scoreValue / byProfessional.length) : 100,
    alerts,
    missingRequirements,
    byProfessional,
    requirementCatalog: professionalDocumentRequirementCatalog.map(item => ({
      category: item.category,
      categoryLabel: professionalDocumentCategoryLabels[item.category] || item.category,
      requirement: item.requirement,
    })),
  }
}

function summarizeProfessional(record) {
  if (!record) return null
  const documentCoverage = Array.isArray(record.documents)
    ? buildProfessionalDocumentsDashboard([record], record.documents).byProfessional[0] || null
    : null

  return {
    id: record.id,
    name: record.name,
    specialty: record.specialty,
    phone: record.phone,
    notes: record.notes,
    photoDataUrl: record.photoDataUrl,
    availability: normalizeProfessionalAvailability(record.availability),
    availabilitySummary: buildAvailabilitySummary(record.availability),
    contractType: record.contractType,
    contractTypeLabel: record.contractType ? (professionalContractTypeLabels[record.contractType] || record.contractType) : null,
    paymentModel: record.paymentModel,
    paymentModelLabel: record.paymentModel ? (professionalPaymentModelLabels[record.paymentModel] || record.paymentModel) : null,
    salaryAmount: record.salaryAmount,
    commissionRate: record.commissionRate,
    payrollBonusAmount: record.payrollBonusAmount,
    payrollDiscountAmount: record.payrollDiscountAmount,
    paymentDay: record.paymentDay,
    payrollNotes: record.payrollNotes,
    compensationSummary: buildProfessionalCompensationSummary(record),
    documentCoverage,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function sanitizeFileName(value, fallback = 'documento') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || fallback
}

function formatDateTimeLabel(value) {
  if (!value) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function createPdfDocument(res, filename) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Producer: "L'Appui",
      Creator: "L'Appui",
    },
  })

  doc.pipe(res)
  return doc
}

function sendPdfDocument(res, filename, renderDocument) {
  const doc = createPdfDocument(res, filename)
  try {
    renderDocument(doc)
  } catch (error) {
    console.error('Falha ao montar PDF:', error)
    doc.addPage()
    renderPdfSectionTitle(doc, 'Aviso de geração')
    doc.fillColor('#2d2117').fontSize(11).text(
      'O PDF foi gerado com conteúdo parcial porque uma seção encontrou inconsistência. Revise os dados e gere novamente, se necessário.'
    )
  } finally {
    doc.end()
  }
}

function renderPdfHeader(doc, { eyebrow, title, subtitle }) {
  const cardX = doc.page.margins.left
  const cardY = 36
  const cardWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

  doc.save()
  doc.roundedRect(cardX, cardY, cardWidth, 104, 22).fill('#faf4eb')
  doc.restore()

  doc.fillColor('#b6894d').fontSize(10).text(eyebrow, cardX + 20, cardY + 18, {
    characterSpacing: 1.1,
  })
  doc.fillColor('#2d2117').fontSize(22).text(title, cardX + 20, cardY + 38, {
    width: cardWidth - 40,
  })
  doc.fillColor('#6f6154').fontSize(10).text(subtitle, cardX + 20, cardY + 76, {
    width: cardWidth - 40,
    lineGap: 2,
  })
  doc.y = cardY + 126
}

function renderPdfSectionTitle(doc, title) {
  doc.moveDown(0.35)
  doc.fillColor('#b6894d').fontSize(11).text(title.toUpperCase(), {
    characterSpacing: 0.8,
  })
  doc.moveDown(0.2)
}

function renderPdfField(doc, label, value) {
  doc.fillColor('#6f6154').fontSize(9).text(label.toUpperCase(), {
    characterSpacing: 0.6,
  })
  doc.fillColor('#2d2117').fontSize(11).text(value || 'Não informado', {
    lineGap: 2,
  })
  doc.moveDown(0.45)
}

function renderPdfParagraphs(doc, text) {
  String(text || '')
    .split('\n')
    .forEach(line => {
      doc.fillColor('#2d2117').fontSize(11).text(line || ' ', {
        lineGap: 3,
      })
      doc.moveDown(line ? 0.2 : 0.05)
    })
}

function extractDataUrlImageBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i)
  if (!match) return null
  return Buffer.from(match[1], 'base64')
}

function renderConsentRecordPdf(doc, { clinicName, record }) {
  renderPdfHeader(doc, {
    eyebrow: "L'APPUI | TERMO DE CONSENTIMENTO",
    title: record.title,
    subtitle: `Documento clínico vinculado ao prontuário de ${record.client.name}.`,
  })

  renderPdfSectionTitle(doc, 'Identificação e rastreabilidade')
  renderPdfField(doc, 'Clínica', clinicName || "L'Appui")
  renderPdfField(doc, 'Cliente', record.client.name)
  renderPdfField(doc, 'Status', record.status === 'SIGNED' ? 'Assinado' : record.status === 'REVOKED' ? 'Revogado' : 'Pendente')
  renderPdfField(doc, 'Versão', record.versionLabel || 'v1')
  renderPdfField(doc, 'Gerado em', formatDateTimeLabel(record.createdAt))
  renderPdfField(doc, 'Assinado em', formatDateTimeLabel(record.signedAt))
  renderPdfField(doc, 'Documento do assinante', record.signerDocument || record.client.cpf || 'Não informado')
  renderPdfField(doc, 'Profissional responsável', record.professionalName || 'Não informado')

  renderPdfSectionTitle(doc, 'Conteúdo do termo')
  renderPdfParagraphs(doc, record.termText)

  doc.moveDown(0.5)
  renderPdfSectionTitle(doc, 'Evidência de assinatura')
  renderPdfField(doc, 'Nome de quem assinou', record.signerName || record.client.name)
  renderPdfField(doc, 'Hash da assinatura', record.signatureHash || 'Ainda não gerado')
  renderPdfField(doc, 'IP do registro', record.signedIp || 'Não registrado')
  renderPdfField(doc, 'Navegador', record.signedUserAgent || 'Não registrado')

  const signatureImage = extractDataUrlImageBuffer(record.signatureDataUrl)
  if (signatureImage) {
    try {
      const imageTop = doc.y + 4
      doc.fillColor('#6f6154').fontSize(9).text('Assinatura capturada digitalmente', {
        characterSpacing: 0.5,
      })
      doc.moveDown(0.25)
      doc.image(signatureImage, doc.page.margins.left, imageTop + 14, {
        fit: [240, 90],
        align: 'left',
      })
      doc.y = imageTop + 112
    } catch (error) {
      console.error('Não foi possível renderizar a imagem da assinatura no PDF:', error)
      doc.fillColor('#6f6154').fontSize(10).text('A imagem da assinatura não pôde ser incorporada ao PDF, mas o registro textual foi preservado.')
    }
  } else {
    doc.fillColor('#6f6154').fontSize(10).text('Nenhuma imagem de assinatura foi anexada a este registro.')
  }
}

function renderServicePopPdf(doc, { clinicName, service, pop }) {
  renderPdfHeader(doc, {
    eyebrow: "L'APPUI | POP DO PROCEDIMENTO",
    title: pop.title,
    subtitle: `Procedimento ${service.name} com versão pronta para consulta, impressão e rastreabilidade.`,
  })

  renderPdfSectionTitle(doc, 'Dados do procedimento')
  renderPdfField(doc, 'Clínica', clinicName)
  renderPdfField(doc, 'Procedimento', service.name)
  renderPdfField(doc, 'Tempo médio', service.duration ? `${service.duration} minutos` : 'Conforme avaliação')
  renderPdfField(doc, 'Última atualização', formatDateTimeLabel(pop.updatedAt))

  renderPdfSectionTitle(doc, 'Conteúdo do POP')
  renderPdfParagraphs(doc, pop.content)
}

function getBillingSnapshot(user) {
  const aggregateUser = mergeLegacyUserAggregate(user)
  const now = new Date()
  const subscription = aggregateUser.ownedClinic?.subscription || buildClinicAggregateSeed(aggregateUser).subscription
  const graceEndsAt = subscription.graceEndsAt || addDays(aggregateUser.createdAt || now, 7)
  const dueAnchor = subscription.nextDueAt || graceEndsAt
  const blockAt = addDays(dueAnchor, 7)

  let effectiveStatus = subscription.status || 'TRIAL'
  let blocked = false

  if (effectiveStatus === 'ACTIVE' && subscription.nextDueAt && now > subscription.nextDueAt) {
    effectiveStatus = now > blockAt ? 'BLOCKED' : 'OVERDUE'
  } else if (effectiveStatus !== 'ACTIVE' && now > graceEndsAt) {
    effectiveStatus = 'BLOCKED'
  }

  if (effectiveStatus === 'BLOCKED') {
    blocked = true
  }

  const diffBase = effectiveStatus === 'ACTIVE'
    ? (subscription.nextDueAt || graceEndsAt)
    : blockAt

  const daysRemaining = Math.max(0, Math.ceil((diffBase.getTime() - now.getTime()) / 86400000))

  let message = 'Configure o valor e a proxima cobranca da assinatura.'
  if (effectiveStatus === 'BLOCKED') {
    message = 'Acesso da clínica bloqueado até a confirmação do pagamento.'
  } else if (effectiveStatus === 'OVERDUE') {
    message = 'Pagamento em atraso. Confirme a assinatura para liberar a operacao.'
  } else if (effectiveStatus === 'ACTIVE') {
    message = subscription.nextDueAt
      ? `Pagamento em dia. Proxima cobranca prevista para ${subscription.nextDueAt.toISOString()}.`
      : 'Pagamento em dia.'
  }

  return {
    status: subscription.status || 'TRIAL',
    effectiveStatus,
    blocked,
    amount: subscription.amount ?? null,
    reference: subscription.reference ?? null,
    notes: subscription.notes ?? null,
    graceEndsAt,
    lastPaidAt: subscription.lastPaidAt ?? null,
    nextDueAt: subscription.nextDueAt ?? null,
    blockAt,
    daysRemaining,
    message,
  }
}

function serializeUser(user, options = {}) {
  const aggregateUser = mergeLegacyUserAggregate(user)
  const billing = options.billing || getBillingSnapshot(aggregateUser)

  return {
    id: aggregateUser.id,
    email: aggregateUser.email,
    clinicName: aggregateUser.clinicName,
    clinicLogoDataUrl: aggregateUser.clinicLogoDataUrl,
    clinicOperationalScopes: Array.isArray(aggregateUser.clinicOperationalScopes)
      ? aggregateUser.clinicOperationalScopes
      : [],
    role: aggregateUser.role,
    createdAt: aggregateUser.createdAt,
    clinicId: aggregateUser.ownedClinic?.id || null,
    clinicStatus: aggregateUser.ownedClinic?.status || mapBillingStatusToClinicStatus(billing.status),
    billing,
    supportContext: options.supportContext || null,
    supportContact: options.supportContact || getSupportContact({
      supportContactName: SUPPORT_CONTACT_NAME,
      supportContactEmail: SUPPORT_CONTACT_EMAIL,
      supportContactPhone: SUPPORT_CONTACT_PHONE,
    }),
  }
}

function serializeSupportUser() {
  return {
    ...serializeUser(buildSupportUser({
      supportAdminEmail: SUPPORT_ADMIN_EMAIL,
      supportAdminName: SUPPORT_ADMIN_NAME,
    }), {
      billing: getSupportBillingSnapshot(),
      supportContact: getSupportContact({
        supportContactName: SUPPORT_CONTACT_NAME,
        supportContactEmail: SUPPORT_CONTACT_EMAIL,
        supportContactPhone: SUPPORT_CONTACT_PHONE,
      }),
    }),
    support: true,
  }
}

function getProntuarioLockMessage() {
  return 'Prontuário bloqueado após confirmação de pagamento. Apenas visualização dos dados e download em PDF estão disponíveis.'
}

function getClientProntuarioStatus(client) {
  return {
    isPaid: Boolean(client?.isPaid),
    isLocked: Boolean(client?.isLocked),
    lockedAt: client?.lockedAt || null,
  }
}

function assertClientProntuarioEditable(client) {
  if (client?.isLocked) {
    throw httpError(423, getProntuarioLockMessage())
  }
}

async function ensureClientOwnership(userId, clientId) {
  return prisma.client.findFirstOrThrow({ where: { id: clientId, userId, deletedAt: null } })
}

async function ensureEditableClientOwnership(userId, clientId) {
  const client = await ensureClientOwnership(userId, clientId)
  assertClientProntuarioEditable(client)
  return client
}

async function ensureServiceOwnership(userId, serviceId) {
  await prisma.service.findFirstOrThrow({ where: { id: serviceId, userId, active: true } })
}

async function ensureProfessionalOwnership(userId, professionalId) {
  return prisma.professional.findFirstOrThrow({
    where: { id: professionalId, userId, active: true },
    select: { id: true, name: true, specialty: true },
  })
}

async function ensureProfessionalDocumentOwnership(userId, documentId) {
  return prisma.professionalDocument.findFirstOrThrow({
    where: { id: documentId, userId },
    include: {
      professional: { select: { id: true, name: true, specialty: true, active: true } },
    },
  })
}

async function ensureConsentRecordOwnership(userId, consentRecordId) {
  return prisma.consentRecord.findFirstOrThrow({
    where: { id: consentRecordId, userId },
    include: {
      client: {
        select: { id: true, name: true, email: true, phone: true, cpf: true, isPaid: true, isLocked: true, lockedAt: true },
      },
    },
  })
}

async function ensureEditableConsentRecordOwnership(userId, consentRecordId) {
  const record = await ensureConsentRecordOwnership(userId, consentRecordId)
  assertClientProntuarioEditable(record.client)
  return record
}

function normalizeClientData(data) {
  const normalized = {}
  if ('name' in data) normalized.name = data.name
  if ('phone' in data) normalized.phone = data.phone
  if ('email' in data) normalized.email = data.email ? data.email.toLowerCase() : null
  if ('birthDate' in data) normalized.birthDate = data.birthDate ? parseDateOnly(data.birthDate, 'birthDate') : null
  if ('cpf' in data) normalized.cpf = sanitizeCpf(data.cpf)
  if ('photoDataUrl' in data) normalized.photoDataUrl = data.photoDataUrl?.trim() || null
  if ('sex' in data) normalized.sex = data.sex?.trim() || null
  if ('maritalStatus' in data) normalized.maritalStatus = data.maritalStatus?.trim() || null
  if ('profession' in data) normalized.profession = data.profession?.trim() || null
  if ('addressFull' in data) normalized.addressFull = data.addressFull?.trim() || null
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  return normalized
}

function normalizeProfessionalData(data) {
  const normalized = {}
  if ('name' in data) normalized.name = data.name
  if ('specialty' in data) normalized.specialty = data.specialty
  if ('phone' in data) normalized.phone = data.phone?.trim() || null
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('photoDataUrl' in data) normalized.photoDataUrl = data.photoDataUrl?.trim() || null
  if ('availability' in data) normalized.availability = normalizeProfessionalAvailability(data.availability)
  if ('contractType' in data) normalized.contractType = data.contractType || null
  if ('paymentModel' in data) normalized.paymentModel = data.paymentModel || null
  if ('salaryAmount' in data) normalized.salaryAmount = parseDecimalValue(data.salaryAmount, 'salaryAmount')
  if ('commissionRate' in data) normalized.commissionRate = parseDecimalValue(data.commissionRate, 'commissionRate')
  if ('payrollBonusAmount' in data) normalized.payrollBonusAmount = parseDecimalValue(data.payrollBonusAmount, 'payrollBonusAmount')
  if ('payrollDiscountAmount' in data) normalized.payrollDiscountAmount = parseDecimalValue(data.payrollDiscountAmount, 'payrollDiscountAmount')
  if ('paymentDay' in data) normalized.paymentDay = data.paymentDay || null
  if ('payrollNotes' in data) normalized.payrollNotes = data.payrollNotes?.trim() || null
  if ('active' in data) normalized.active = data.active
  return normalized
}

function normalizeProfessionalDocumentData(data) {
  const normalized = {}
  if ('category' in data) normalized.category = data.category
  if ('documentType' in data) normalized.documentType = data.documentType?.trim()
  if ('title' in data) normalized.title = data.title?.trim()
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('expiresAt' in data) normalized.expiresAt = data.expiresAt ? parseDateOnly(data.expiresAt, 'expiresAt') : null
  if ('fileName' in data) normalized.fileName = data.fileName?.trim()
  if ('fileMimeType' in data) normalized.fileMimeType = data.fileMimeType?.trim() || null
  if ('fileDataUrl' in data) normalized.fileDataUrl = data.fileDataUrl
  return normalized
}

function normalizeServiceData(data) {
  const normalized = {}
  if ('name' in data) normalized.name = data.name
  if ('description' in data) normalized.description = data.description?.trim() || null
  if ('duration' in data) normalized.duration = data.duration
  if ('price' in data) normalized.price = data.price
  if ('active' in data) normalized.active = data.active
  return normalized
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalChoice(value, allowedValues) {
  const normalized = normalizeOptionalText(value)
  return normalized && allowedValues.includes(normalized) ? normalized : ''
}

function normalizeOptionalBoolean(value) {
  return Boolean(value)
}

function normalizeAnamnesisPhotos(list) {
  return Array.isArray(list)
    ? list.map(photo => ({
      id: photo.id,
      caption: photo.caption?.trim() || '',
      dataUrl: photo.dataUrl,
    }))
    : []
}

function normalizeAnamnesisNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = Number(value)
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null
}

function normalizeAnamnesisPositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = Number(value)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

function normalizeAestheticHistoryEntries(list, legacyAestheticHistory = {}) {
  const derivedLegacyEntries = (
    normalizeOptionalText(legacyAestheticHistory.procedureDetails)
    || normalizeOptionalText(legacyAestheticHistory.lastProcedureDate)
    || normalizeOptionalBoolean(legacyAestheticHistory.hadAestheticProcedures)
    || normalizeOptionalBoolean(legacyAestheticHistory.adverseReaction)
  )
    ? [{
      id: 'legacy-aesthetic-history-1',
      procedureName: normalizeOptionalText(legacyAestheticHistory.procedureDetails) || 'Procedimento estético anterior',
      procedureDate: normalizeOptionalText(legacyAestheticHistory.lastProcedureDate),
      notes: normalizeOptionalBoolean(legacyAestheticHistory.hadAestheticProcedures)
        ? 'Paciente relata histórico de procedimentos estéticos anteriores.'
        : '',
      intercurrences: normalizeOptionalBoolean(legacyAestheticHistory.adverseReaction)
        ? 'Paciente informou reação adversa em procedimento anterior.'
        : '',
    }]
    : []

  const source = Array.isArray(list) && list.length ? list : derivedLegacyEntries
  return source
    .map((entry, index) => ({
      id: normalizeOptionalText(entry?.id) || `aesthetic-history-${index + 1}`,
      procedureName: normalizeOptionalText(entry?.procedureName),
      procedureDate: normalizeOptionalText(entry?.procedureDate),
      notes: normalizeOptionalText(entry?.notes),
      intercurrences: normalizeOptionalText(entry?.intercurrences),
    }))
    .filter(entry => entry.procedureName || entry.procedureDate || entry.notes || entry.intercurrences)
}

function normalizeAnamnesisConditionList(list, observedConditions = {}, dermatologicalHistory = {}) {
  const definitions = [
    { type: 'acne', label: 'Acne' },
    { type: 'melasma', label: 'Melasma' },
    { type: 'wrinkles', label: 'Rugas' },
    { type: 'sagging', label: 'Flacidez' },
    { type: 'spots', label: 'Manchas' },
    { type: 'scars', label: 'Cicatrizes' },
    { type: 'localizedFat', label: 'Gordura localizada' },
    { type: 'cellulite', label: 'Celulite' },
    { type: 'stretchMarks', label: 'Estrias' },
  ]

  const indexedList = new Map(
    (Array.isArray(list) ? list : [])
      .filter(item => item && normalizeOptionalText(item.type))
      .map(item => [normalizeOptionalText(item.type), item])
  )

  const normalizedDefaults = definitions.map(definition => {
    const current = indexedList.get(definition.type)
    const derivedPresent = current
      ? normalizeOptionalBoolean(current.present)
      : definition.type === 'acne'
        ? normalizeOptionalBoolean(dermatologicalHistory.activeAcne)
        : definition.type === 'melasma'
          ? normalizeOptionalBoolean(dermatologicalHistory.melasma)
          : normalizeOptionalBoolean(observedConditions?.[definition.type])

    return {
      type: definition.type,
      label: normalizeOptionalText(current?.label) || definition.label,
      present: derivedPresent,
      classification: normalizeOptionalText(current?.classification),
      notes: normalizeOptionalText(current?.notes),
    }
  })

  const normalizedCustom = (Array.isArray(list) ? list : [])
    .filter(item => item && normalizeOptionalText(item.type) && !definitions.some(definition => definition.type === normalizeOptionalText(item.type)))
    .map(item => ({
      type: normalizeOptionalText(item.type),
      label: normalizeOptionalText(item.label) || normalizeOptionalText(item.type),
      present: normalizeOptionalBoolean(item.present),
      classification: normalizeOptionalText(item.classification),
      notes: normalizeOptionalText(item.notes),
    }))

  return [...normalizedDefaults, ...normalizedCustom]
}

function buildObservedConditionsFromConditionList(list) {
  const normalizedObservedConditions = {
    wrinkles: false,
    sagging: false,
    spots: false,
    scars: false,
    localizedFat: false,
    cellulite: false,
    stretchMarks: false,
  }
  ;(Array.isArray(list) ? list : []).forEach(condition => {
    if (condition?.type in normalizedObservedConditions) {
      normalizedObservedConditions[condition.type] = normalizeOptionalBoolean(condition.present)
    }
  })
  return normalizedObservedConditions
}

function normalizeTreatmentServices(list, treatmentPlan = {}) {
  const derivedLegacyServices = (
    normalizeOptionalText(treatmentPlan.recommendedProcedure)
    || normalizeOptionalText(treatmentPlan.sessionInterval)
    || normalizeOptionalText(treatmentPlan.productsUsed)
    || normalizeOptionalText(treatmentPlan.equipmentsUsed)
  )
    ? [{
      id: 'legacy-treatment-service-1',
      name: normalizeOptionalText(treatmentPlan.recommendedProcedure) || 'Protocolo estético recomendado',
      sessions: normalizeAnamnesisPositiveInteger(treatmentPlan.sessionCount) || 1,
      description: [
        normalizeOptionalText(treatmentPlan.sessionInterval),
        normalizeOptionalText(treatmentPlan.productsUsed),
        normalizeOptionalText(treatmentPlan.equipmentsUsed),
      ].filter(Boolean).join('\n\n'),
      adverseEffects: '',
    }]
    : []

  const source = Array.isArray(list) && list.length ? list : derivedLegacyServices
  return source
    .map((service, index) => ({
      id: normalizeOptionalText(service?.id) || `treatment-service-${index + 1}`,
      name: normalizeOptionalText(service?.name),
      sessions: normalizeAnamnesisPositiveInteger(service?.sessions) || 1,
      description: normalizeOptionalText(service?.description),
      adverseEffects: normalizeOptionalText(service?.adverseEffects),
    }))
    .filter(service => service.name || service.description || service.adverseEffects)
}

function normalizeAnamnesisData(data) {
  const answers = 'answers' in data ? data.answers : data
  const birthDate = parseDateOnly(answers.identification.birthDate, 'identification.birthDate')
  const signedAt = parseDateOnly(answers.signatures.signedAt, 'signatures.signedAt')

  const healthHistory = answers.healthHistory || {}
  const preExistingConditions = healthHistory.preExistingConditions || {}
  const surgeries = healthHistory.surgeries || {}
  const medications = healthHistory.medications || {}
  const allergies = healthHistory.allergies || {}
  const dermatologicalHistory = healthHistory.dermatologicalHistory || {}
  const lifestyle = answers.lifestyle || {}
  const aestheticEvaluation = answers.aestheticEvaluation || {}
  const contraindications = answers.contraindications || {}
  const expectations = answers.expectations || {}
  const photoRecord = answers.photoRecord || {}
  const treatmentPlan = answers.treatmentPlan || {}
  const scienceTerm = answers.scienceTerm || {}
  const legacyAestheticHistory = answers.aestheticHistory || {}
  const normalizedConditions = normalizeAnamnesisConditionList(
    aestheticEvaluation.conditions,
    aestheticEvaluation.observedConditions,
    dermatologicalHistory
  )
  const normalizedPhotos = normalizeAnamnesisPhotos(photoRecord.photos)
  const clinicalUseAuthorized = normalizeOptionalBoolean(photoRecord.clinicalUseAuthorized || photoRecord.imageUseAuthorized)
  const marketingUseAuthorized = normalizeOptionalBoolean(photoRecord.marketingUseAuthorized || photoRecord.imageUseAuthorized)
  const consentAwarenessConfirmed = normalizeOptionalBoolean(photoRecord.consentAwarenessConfirmed)

  if (normalizedPhotos.length && !clinicalUseAuthorized) {
    throw httpError(400, 'Para anexar fotos ao prontuario, registre o consentimento clinico de imagem.')
  }
  if (normalizedPhotos.length && !consentAwarenessConfirmed) {
    throw httpError(400, 'Para anexar fotos ao prontuario, confirme que a autorizacao de imagem foi explicada e registrada.')
  }

  const normalizedAnswers = {
    identification: {
      fullName: answers.identification.fullName.trim(),
      cpf: sanitizeCpf(answers.identification.cpf),
      birthDate: toDateOnlyIso(birthDate),
      age: calculateAgeFromDate(birthDate),
      sex: normalizeOptionalChoice(answers.identification.sex, ['FEMININO', 'MASCULINO', 'NAO_BINARIO', 'PREFIRO_NAO_INFORMAR', 'OUTRO']),
      maritalStatus: normalizeOptionalChoice(answers.identification.maritalStatus, ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'OUTRO']),
      profession: normalizeOptionalText(answers.identification.profession),
      phone: answers.identification.phone.trim(),
      email: normalizeOptionalText(answers.identification.email).toLowerCase(),
      addressFull: normalizeOptionalText(answers.identification.addressFull),
    },
    chiefComplaint: {
      desiredProcedure: normalizeOptionalText(answers.chiefComplaint.desiredProcedure),
      currentDiscomfort: answers.chiefComplaint.currentDiscomfort.trim(),
      complaintDuration: normalizeOptionalText(answers.chiefComplaint.complaintDuration),
      previousTreatment: normalizeOptionalText(answers.chiefComplaint.previousTreatment),
    },
    healthHistory: {
      preExistingConditions: {
        hypertension: normalizeOptionalBoolean(preExistingConditions.hypertension),
        diabetes: normalizeOptionalBoolean(preExistingConditions.diabetes),
        heartDisease: normalizeOptionalBoolean(preExistingConditions.heartDisease),
        autoimmuneDisease: normalizeOptionalBoolean(preExistingConditions.autoimmuneDisease),
        hormonalIssues: normalizeOptionalBoolean(preExistingConditions.hormonalIssues),
        kidneyIssues: normalizeOptionalBoolean(preExistingConditions.kidneyIssues),
        liverIssues: normalizeOptionalBoolean(preExistingConditions.liverIssues),
        otherConditions: normalizeOptionalText(preExistingConditions.otherConditions),
      },
      surgeries: {
        hadSurgeries: normalizeOptionalBoolean(surgeries.hadSurgeries),
        surgeryDetails: normalizeOptionalText(surgeries.surgeryDetails),
        approximateDate: normalizeOptionalText(surgeries.approximateDate),
        hadComplications: normalizeOptionalBoolean(surgeries.hadComplications),
      },
      medications: {
        continuousMedication: normalizeOptionalBoolean(medications.continuousMedication),
        medicationDetails: normalizeOptionalText(medications.medicationDetails),
        anticoagulants: normalizeOptionalBoolean(medications.anticoagulants),
        corticosteroids: normalizeOptionalBoolean(medications.corticosteroids),
        recentAntibiotics: normalizeOptionalBoolean(medications.recentAntibiotics),
      },
      allergies: {
        hasAllergies: normalizeOptionalBoolean(allergies.hasAllergies),
        medicationAllergy: normalizeOptionalBoolean(allergies.medicationAllergy),
        cosmeticsAllergy: normalizeOptionalBoolean(allergies.cosmeticsAllergy),
        anestheticsAllergy: normalizeOptionalBoolean(allergies.anestheticsAllergy),
        notes: normalizeOptionalText(allergies.notes),
      },
      dermatologicalHistory: {
        activeAcne: normalizeOptionalBoolean(dermatologicalHistory.activeAcne),
        rosacea: normalizeOptionalBoolean(dermatologicalHistory.rosacea),
        melasma: normalizeOptionalBoolean(dermatologicalHistory.melasma),
        skinSensitivity: normalizeOptionalBoolean(dermatologicalHistory.skinSensitivity),
        keloidTendency: normalizeOptionalBoolean(dermatologicalHistory.keloidTendency),
      },
      aestheticHistory: normalizeAestheticHistoryEntries(healthHistory.aestheticHistory, legacyAestheticHistory),
    },
    lifestyle: {
      smoking: normalizeOptionalBoolean(lifestyle.smoking),
      alcoholConsumption: normalizeOptionalBoolean(lifestyle.alcoholConsumption),
      alcoholFrequency: normalizeOptionalChoice(lifestyle.alcoholFrequency, ['NAO_CONSOME', 'SOCIAL', 'SEMANAL', 'FREQUENTE']),
      dailyWaterIntake: normalizeOptionalText(lifestyle.dailyWaterIntake),
      diet: normalizeOptionalText(lifestyle.diet),
      physicalActivity: normalizeOptionalBoolean(lifestyle.physicalActivity),
      workoutsPerWeek: normalizeAnamnesisNonNegativeInteger(lifestyle.workoutsPerWeek),
      sleepQuality: normalizeOptionalChoice(lifestyle.sleepQuality, ['OTIMA', 'BOA', 'REGULAR', 'RUIM']),
    },
    aestheticEvaluation: {
      skinType: normalizeOptionalChoice(aestheticEvaluation.skinType, ['OLEOSA', 'SECA', 'MISTA', 'NORMAL']),
      fitzpatrick: normalizeOptionalChoice(aestheticEvaluation.fitzpatrick, ['I', 'II', 'III', 'IV', 'V', 'VI']),
      conditions: normalizedConditions,
      observedConditions: buildObservedConditionsFromConditionList(normalizedConditions),
    },
    contraindications: {
      pregnancy: normalizeOptionalBoolean(contraindications.pregnancy),
      lactation: normalizeOptionalBoolean(contraindications.lactation),
      activeInfections: normalizeOptionalBoolean(contraindications.activeInfections),
      recentIsotretinoin: normalizeOptionalBoolean(contraindications.recentIsotretinoin),
      activeDermatologicalDiseases: normalizeOptionalBoolean(contraindications.activeDermatologicalDiseases),
      metallicImplants: normalizeOptionalBoolean(contraindications.metallicImplants),
      additionalNotes: normalizeOptionalText(contraindications.additionalNotes),
    },
    expectations: {
      treatmentExpectations: normalizeOptionalText(expectations.treatmentExpectations),
      expectedResultTimeline: normalizeOptionalText(expectations.expectedResultTimeline),
      awareOfLimitations: normalizeOptionalBoolean(expectations.awareOfLimitations),
    },
    treatmentObjective: normalizeOptionalText(answers.treatmentObjective),
    photoRecord: {
      photos: normalizedPhotos,
      imageUseAuthorized: marketingUseAuthorized,
      clinicalUseAuthorized,
      marketingUseAuthorized,
      consentVersion: normalizeOptionalText(photoRecord.consentVersion) || 'photo-consent-v1',
      consentAcceptedAt: clinicalUseAuthorized
        ? (normalizeOptionalText(photoRecord.consentAcceptedAt) || new Date().toISOString())
        : null,
      consentAwarenessConfirmed,
    },
    treatmentPlan: {
      recommendedProcedure: normalizeOptionalText(treatmentPlan.recommendedProcedure),
      sessionCount: normalizeAnamnesisPositiveInteger(treatmentPlan.sessionCount),
      sessionInterval: normalizeOptionalText(treatmentPlan.sessionInterval),
      productsUsed: normalizeOptionalText(treatmentPlan.productsUsed),
      equipmentsUsed: normalizeOptionalText(treatmentPlan.equipmentsUsed),
      services: normalizeTreatmentServices(treatmentPlan.services, treatmentPlan),
    },
    scienceTerm: {
      informedHistoryAccurately: normalizeOptionalBoolean(scienceTerm.informedHistoryAccurately),
      awareOfRisks: normalizeOptionalBoolean(scienceTerm.awareOfRisks),
      receivedPreAndPostGuidance: normalizeOptionalBoolean(scienceTerm.receivedPreAndPostGuidance),
    },
    signatures: {
      patientSignatureDataUrl: answers.signatures.patientSignatureDataUrl,
      professionalSignatureDataUrl: answers.signatures.professionalSignatureDataUrl,
      professionalId: normalizeAnamnesisPositiveInteger(answers.signatures.professionalId),
      professionalName: normalizeOptionalText(answers.signatures.professionalName),
      signedAt: toDateOnlyIso(signedAt),
    },
  }

  const clientData = {
    name: normalizedAnswers.identification.fullName,
    cpf: normalizedAnswers.identification.cpf,
    birthDate: normalizedAnswers.identification.birthDate,
    phone: normalizedAnswers.identification.phone,
    email: normalizedAnswers.identification.email || '',
    sex: normalizedAnswers.identification.sex,
    maritalStatus: normalizedAnswers.identification.maritalStatus,
    profession: normalizedAnswers.identification.profession,
    addressFull: normalizedAnswers.identification.addressFull,
  }

  return {
    answers: normalizedAnswers,
    clientData: normalizeClientData(clientData),
  }
}

function renderClientMedicalRecordPdf(doc, { clinicName, client }) {
  const latestAnamnesis = client.anamneses?.[0] || null
  const answers = latestAnamnesis?.answers || {}
  const identification = answers.identification || {}
  const chiefComplaint = answers.chiefComplaint || {}
  const healthHistory = answers.healthHistory || {}
  const lifestyle = answers.lifestyle || {}
  const aestheticEvaluation = answers.aestheticEvaluation || {}
  const expectations = answers.expectations || {}
  const treatmentPlan = answers.treatmentPlan || {}
  const scienceTerm = answers.scienceTerm || {}
  const signatures = answers.signatures || {}
  const photoRecord = answers.photoRecord || {}
  const conditions = Array.isArray(aestheticEvaluation.conditions) ? aestheticEvaluation.conditions.filter(item => item?.present) : []
  const aestheticHistory = Array.isArray(healthHistory.aestheticHistory) ? healthHistory.aestheticHistory : []
  const treatmentServices = Array.isArray(treatmentPlan.services) ? treatmentPlan.services : []
  const recentAppointments = Array.isArray(client.appointments) ? client.appointments : []
  const latestConsent = client.consentRecords?.[0] || null
  const prontuarioStatus = getClientProntuarioStatus(client)
  const photoCount = Array.isArray(photoRecord.photos) ? photoRecord.photos.length : 0
  const clinicalPhotoConsent = Boolean(photoRecord.clinicalUseAuthorized || photoRecord.imageUseAuthorized)
  const marketingPhotoConsent = Boolean(photoRecord.marketingUseAuthorized || photoRecord.imageUseAuthorized)

  renderPdfHeader(doc, {
    eyebrow: 'Prontuário clínico',
    title: client.name || 'Cliente',
    subtitle: clinicName ? `Clínica ${clinicName}` : 'Resumo consolidado do atendimento',
  })

  renderPdfSectionTitle(doc, 'Status do prontuário')
  renderPdfField(doc, 'Pagamento confirmado', prontuarioStatus.isPaid ? 'Sim' : 'Não')
  renderPdfField(doc, 'Bloqueado para edição', prontuarioStatus.isLocked ? 'Sim' : 'Não')
  renderPdfField(doc, 'Bloqueado em', formatDateTimeLabel(prontuarioStatus.lockedAt))

  renderPdfSectionTitle(doc, 'Cadastro do cliente')
  renderPdfField(doc, 'Nome completo', client.name)
  renderPdfField(doc, 'CPF', client.cpf)
  renderPdfField(doc, 'Telefone', client.phone)
  renderPdfField(doc, 'E-mail', client.email)
  renderPdfField(doc, 'Nascimento', formatDateTimeLabel(client.birthDate))
  renderPdfField(doc, 'Profissão', client.profession)
  renderPdfField(doc, 'Estado civil', client.maritalStatus)
  renderPdfField(doc, 'Sexo', client.sex)
  renderPdfField(doc, 'Endereço', client.addressFull)
  renderPdfField(doc, 'Observações cadastrais', client.notes)

  renderPdfSectionTitle(doc, 'Anamnese mais recente')
  if (!latestAnamnesis) {
    renderPdfParagraphs(doc, 'Nenhuma anamnese registrada para este cliente.')
  } else {
    renderPdfField(doc, 'Versão mais recente', formatDateTimeLabel(latestAnamnesis.filledAt))
    renderPdfField(doc, 'Queixa principal', chiefComplaint.currentDiscomfort)
    renderPdfField(doc, 'Procedimento desejado', chiefComplaint.desiredProcedure)
    renderPdfField(doc, 'Tempo de percepção', chiefComplaint.complaintDuration)
    renderPdfField(doc, 'Tratamento anterior', chiefComplaint.previousTreatment)
    renderPdfField(doc, 'Expectativas', expectations.treatmentExpectations)
    renderPdfField(doc, 'Objetivo do tratamento', answers.treatmentObjective)
    renderPdfField(doc, 'Prazo esperado para resultado', expectations.expectedResultTimeline)
    renderPdfField(doc, 'Ciente das limitações', expectations.awareOfLimitations ? 'Sim' : 'Não')
    renderPdfField(doc, 'Atividade física por semana', lifestyle.workoutsPerWeek)
    renderPdfField(doc, 'Sono', lifestyle.sleepQuality)
    renderPdfField(doc, 'Água por dia', lifestyle.dailyWaterIntake)
    renderPdfField(doc, 'Alimentação', lifestyle.diet)
    renderPdfField(doc, 'Tabagismo', lifestyle.smoking ? 'Sim' : 'Não')
    renderPdfField(doc, 'Consumo de álcool', lifestyle.alcoholConsumption ? 'Sim' : 'Não')
    renderPdfField(doc, 'Frequência do álcool', lifestyle.alcoholFrequency)
    renderPdfField(doc, 'Tipo de pele', aestheticEvaluation.skinType)
    renderPdfField(doc, 'Fototipo de Fitzpatrick', aestheticEvaluation.fitzpatrick)
    renderPdfField(
      doc,
      'Condições observadas',
      conditions.length
        ? conditions.map(condition => condition.classification ? `${condition.label} (${condition.classification})` : condition.label).join(', ')
        : 'Nenhuma condição classificada'
    )
    renderPdfField(doc, 'Fotos clínicas anexadas', photoCount ? `${photoCount} registro(s)` : 'Nenhum registro')
    renderPdfField(doc, 'Uso clínico de imagem', clinicalPhotoConsent ? 'Sim' : 'Não')
    renderPdfField(doc, 'Uso em marketing', marketingPhotoConsent ? 'Sim' : 'Não')
  }

  if (aestheticHistory.length) {
    renderPdfSectionTitle(doc, 'Histórico estético')
    aestheticHistory.forEach((entry, index) => {
      renderPdfField(doc, `Procedimento ${index + 1}`, entry.procedureName)
      renderPdfField(doc, 'Data aproximada', entry.procedureDate)
      renderPdfField(doc, 'Observações', entry.notes)
      renderPdfField(doc, 'Intercorrências', entry.intercurrences)
    })
  }

  if (treatmentServices.length || treatmentPlan.recommendedProcedure || treatmentPlan.productsUsed || treatmentPlan.equipmentsUsed) {
    renderPdfSectionTitle(doc, 'Plano de tratamento')
    renderPdfField(doc, 'Procedimento indicado', treatmentPlan.recommendedProcedure)
    renderPdfField(doc, 'Sessões planejadas', treatmentPlan.sessionCount)
    renderPdfField(doc, 'Intervalo entre sessões', treatmentPlan.sessionInterval)
    renderPdfField(doc, 'Produtos utilizados', treatmentPlan.productsUsed)
    renderPdfField(doc, 'Equipamentos utilizados', treatmentPlan.equipmentsUsed)

    treatmentServices.forEach((service, index) => {
      renderPdfField(doc, `Serviço ${index + 1}`, service.name)
      renderPdfField(doc, 'Sessões deste serviço', service.sessions)
      renderPdfField(doc, 'Descrição clínica', service.description)
      renderPdfField(doc, 'Efeitos adversos esperados', service.adverseEffects)
    })
  }

  renderPdfSectionTitle(doc, 'Ciência e assinaturas')
  renderPdfField(doc, 'Histórico informado corretamente', scienceTerm.informedHistoryAccurately ? 'Sim' : 'Não')
  renderPdfField(doc, 'Ciente dos riscos', scienceTerm.awareOfRisks ? 'Sim' : 'Não')
  renderPdfField(doc, 'Recebeu orientações pré e pós', scienceTerm.receivedPreAndPostGuidance ? 'Sim' : 'Não')
  renderPdfField(doc, 'Profissional responsável', signatures.professionalName)
  renderPdfField(doc, 'Data da assinatura', signatures.signedAt)
  renderPdfField(doc, 'Assinatura do paciente', signatures.patientSignatureDataUrl ? 'Registrada' : 'Não registrada')
  renderPdfField(doc, 'Assinatura do profissional', signatures.professionalSignatureDataUrl ? 'Registrada' : 'Não registrada')

  renderPdfSectionTitle(doc, 'Consentimento')
  renderPdfField(doc, 'Status', latestConsent?.status || 'Sem termo')
  renderPdfField(doc, 'Título', latestConsent?.title)
  renderPdfField(doc, 'Assinado em', formatDateTimeLabel(latestConsent?.signedAt))
  renderPdfField(doc, 'Profissional do termo', latestConsent?.professionalName)

  renderPdfSectionTitle(doc, 'Atendimentos recentes')
  if (!recentAppointments.length) {
    renderPdfParagraphs(doc, 'Nenhum atendimento recente vinculado a este cliente.')
    return
  }

  recentAppointments.forEach((appointment, index) => {
    renderPdfField(doc, `Atendimento ${index + 1}`, formatDateTimeLabel(appointment.startAt))
    renderPdfField(doc, 'Serviço', appointment.service?.name)
    renderPdfField(doc, 'Profissional', appointment.professional?.name)
    renderPdfField(doc, 'Status', appointment.status)
    renderPdfField(doc, 'Pagamento', appointment.payment?.status || 'Sem pagamento')
    renderPdfField(doc, 'Observações', appointment.notes)
  })
}

// Zod schemas for validation
const registerSchema = z.object({
  email: emailField,
  password: z.string().min(15).refine(passwordMeetsPolicy, passwordPolicyMessage),
  clinicName: z.string().trim().min(2),
})

const loginSchema = z.object({ email: emailField, password: z.string() })

const publicLeadSchema = z.object({
  clinicName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: emailField,
  phone: z.string().trim().min(8).max(30),
  city: z.string().trim().max(120).optional(),
  teamSize: z.string().trim().max(80).optional(),
  mainGoal: z.string().trim().max(160).optional(),
  message: z.string().trim().max(1500).optional(),
  requestedDemo: z.boolean().optional(),
  source: z.string().trim().max(255).optional(),
})

const clinicOperationalScopeSchema = z.enum(Object.keys(clinicOperationalScopeCatalog))

const clinicProfileSchema = z.object({
  clinicName: z.string().trim().min(2).max(120).optional(),
  clinicLogoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(1_000_000), z.null()]).optional(),
  clinicOperationalScopes: z.array(clinicOperationalScopeSchema).max(5).optional(),
})

const auditCorrectiveActionSchema = z.object({
  taskKey: z.string().trim().min(3).max(180),
  domainId: z.string().trim().min(2).max(80),
  domainTitle: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(240),
  owner: z.string().trim().min(2).max(120),
  dueLabel: z.string().trim().max(80).nullable().optional(),
  dueAt: z.string().trim().max(20).nullable().optional(),
  evidence: z.string().trim().max(800).nullable().optional(),
  actionUrl: z.string().trim().max(160).nullable().optional(),
  riskLevel: z.enum(['CRITICAL', 'WARNING', 'OK']).default('WARNING'),
  status: auditCorrectiveActionStatusSchema.default('OPEN'),
})

const auditCorrectiveActionPatchSchema = auditCorrectiveActionSchema
  .omit({ taskKey: true })
  .partial()

const SAFE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const SAFE_FILE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const SAFE_EXTENSIONS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
}

function validateImageUploadSafety(dataUrl) {
  if (!dataUrl) return true
  const match = String(dataUrl).match(/^data:([^;]+);base64,/)
  if (!match) return false
  const mimeType = match[1].toLowerCase()
  return SAFE_IMAGE_MIMES.includes(mimeType)
}

function validateAttachmentUploadSafety(data) {
  const { fileDataUrl, fileName } = data
  if (!fileDataUrl) return true
  const match = String(fileDataUrl).match(/^data:([^;]+);base64,/)
  if (!match) return false
  const mimeType = match[1].toLowerCase()
  if (!SAFE_FILE_MIMES.includes(mimeType)) return false

  if (fileName) {
    const extMatch = String(fileName).toLowerCase().match(/\.[a-z0-9]+$/)
    if (!extMatch) return false
    const ext = extMatch[0]
    const allowedExtensions = SAFE_EXTENSIONS[mimeType] || []
    if (!allowedExtensions.includes(ext)) return false
  }
  return true
}

const auditCorrectiveActionAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(220),
  fileMimeType: z.string().trim().max(120).nullable().optional(),
  fileDataUrl: z.string().trim().startsWith('data:').max(7_200_000),
  notes: z.string().trim().max(400).nullable().optional(),
}).refine(validateAttachmentUploadSafety, {
  message: 'Arquivo invalido. Formatos permitidos: JPG, PNG, WebP, PDF, DOC, DOCX. A extensao do arquivo deve corresponder ao tipo.',
  path: ['fileDataUrl'],
})

const clientSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  email: z.union([z.literal(''), emailField]).optional(),
  birthDate: z.string().optional(),
  cpf: z.string().trim().optional(),
  photoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(8_000_000).refine(validateImageUploadSafety, 'Formato de imagem invalido. Use JPEG, PNG ou WebP.'), z.null()]).optional(),
  sex: z.string().trim().optional(),
  maritalStatus: z.string().trim().optional(),
  profession: z.string().trim().optional(),
  addressFull: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

const professionalSchema = z.object({
  name: z.string().trim().min(2),
  specialty: z.string().trim().min(2),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  photoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(8_000_000).refine(validateImageUploadSafety, 'Formato de imagem invalido. Use JPEG, PNG ou WebP.'), z.null()]).optional(),
  availability: z.array(z.object({
    day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    enabled: z.boolean().optional(),
    start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })).max(7).optional(),
  contractType: professionalContractTypeSchema.optional(),
  paymentModel: professionalPaymentModelSchema.optional(),
  salaryAmount: z.number().min(0).nullable().optional(),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  payrollBonusAmount: z.number().min(0).nullable().optional(),
  payrollDiscountAmount: z.number().min(0).nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  payrollNotes: z.string().trim().max(1200).optional(),
  active: z.boolean().optional(),
})

const professionalDocumentSchema = z.object({
  category: professionalDocumentCategorySchema,
  documentType: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(1200).nullable().optional(),
  expiresAt: z.string().trim().max(20).nullable().optional(),
  fileName: z.string().trim().min(1).max(220),
  fileMimeType: z.string().trim().max(120).nullable().optional(),
  fileDataUrl: z.string().trim().startsWith('data:').max(7_200_000),
})

const serviceSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  duration: z.number().int().min(5),
  price: z.number().min(0),
  active: z.boolean().optional(),
})

const appointmentSchema = z.object({
  clientId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  professionalId: z.number().int().positive(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  notes: z.string().trim().optional(),
  price: z.number().min(0),
  status: appointmentStatusSchema.optional(),
})

const paymentSchema = z.object({
  appointmentId: z.number().int().positive(),
  amount: z.number().min(0),
  method: z.enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER']),
  status: paymentStatusSchema.optional(),
  paidAt: z.string().optional(),
})

const anamnesisPhotoSchema = z.object({
  id: z.string().trim().min(2),
  caption: z.string().trim().max(160).optional(),
  dataUrl: z.string().startsWith('data:image/').min(100),
})

const optionalLongText = max => z.string().trim().max(max).optional()
const optionalBoolean = z.boolean().optional()
const optionalEmail = z.union([z.literal(''), emailField]).optional()
const optionalImageDataUrl = z.string().trim().startsWith('data:image/').max(1_000_000)

const anamnesisSexSchema = z.enum(['FEMININO', 'MASCULINO', 'NAO_BINARIO', 'PREFIRO_NAO_INFORMAR', 'OUTRO'])
const anamnesisMaritalStatusSchema = z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'OUTRO'])
const skinTypeSchema = z.enum(['OLEOSA', 'SECA', 'MISTA', 'NORMAL'])
const fitzpatrickSchema = z.enum(['I', 'II', 'III', 'IV', 'V', 'VI'])
const alcoholFrequencySchema = z.enum(['NAO_CONSOME', 'SOCIAL', 'SEMANAL', 'FREQUENTE'])
const sleepQualitySchema = z.enum(['OTIMA', 'BOA', 'REGULAR', 'RUIM'])

const anamnesisAestheticHistoryEntrySchema = z.object({
  id: z.string().trim().min(2),
  procedureName: optionalLongText(200),
  procedureDate: optionalLongText(120),
  notes: optionalLongText(1200),
  intercurrences: optionalLongText(1200),
})

const anamnesisConditionSchema = z.object({
  type: z.string().trim().min(2).max(60),
  label: z.string().trim().min(2).max(80),
  present: optionalBoolean,
  classification: optionalLongText(120),
  notes: optionalLongText(800),
})

const treatmentPlanServiceSchema = z.object({
  id: z.string().trim().min(2),
  name: z.string().trim().min(2).max(200),
  sessions: z.number().int().min(1).max(99),
  description: optionalLongText(2000),
  adverseEffects: z.string().trim().min(2).max(2000),
})

const anamnesisAnswersSchema = z.object({
  identification: z.object({
    fullName: z.string().trim().min(2).max(160),
    cpf: z.string().trim().refine(value => value.replace(/\D/g, '').length === 11, 'CPF invalido'),
    birthDate: z.string().min(1),
    age: z.number().int().min(0).max(130).optional(),
    sex: z.union([anamnesisSexSchema, z.literal('')]).optional(),
    maritalStatus: z.union([anamnesisMaritalStatusSchema, z.literal('')]).optional(),
    profession: optionalLongText(120),
    phone: z.string().trim().min(8).max(30),
    email: optionalEmail,
    addressFull: optionalLongText(500),
  }),
  chiefComplaint: z.object({
    desiredProcedure: optionalLongText(300),
    currentDiscomfort: z.string().trim().min(3).max(600),
    complaintDuration: optionalLongText(200),
    previousTreatment: optionalLongText(500),
  }),
  healthHistory: z.object({
    preExistingConditions: z.object({
      hypertension: optionalBoolean,
      diabetes: optionalBoolean,
      heartDisease: optionalBoolean,
      autoimmuneDisease: optionalBoolean,
      hormonalIssues: optionalBoolean,
      kidneyIssues: optionalBoolean,
      liverIssues: optionalBoolean,
      otherConditions: optionalLongText(500),
    }),
    surgeries: z.object({
      hadSurgeries: optionalBoolean,
      surgeryDetails: optionalLongText(500),
      approximateDate: optionalLongText(120),
      hadComplications: optionalBoolean,
    }),
    medications: z.object({
      continuousMedication: optionalBoolean,
      medicationDetails: optionalLongText(500),
      anticoagulants: optionalBoolean,
      corticosteroids: optionalBoolean,
      recentAntibiotics: optionalBoolean,
    }),
    allergies: z.object({
      hasAllergies: optionalBoolean,
      medicationAllergy: optionalBoolean,
      cosmeticsAllergy: optionalBoolean,
      anestheticsAllergy: optionalBoolean,
      notes: optionalLongText(500),
    }),
    dermatologicalHistory: z.object({
      activeAcne: optionalBoolean,
      rosacea: optionalBoolean,
      melasma: optionalBoolean,
      skinSensitivity: optionalBoolean,
      keloidTendency: optionalBoolean,
    }),
    aestheticHistory: z.array(anamnesisAestheticHistoryEntrySchema).optional(),
  }),
  lifestyle: z.object({
    smoking: optionalBoolean,
    alcoholConsumption: optionalBoolean,
    alcoholFrequency: z.union([alcoholFrequencySchema, z.literal('')]).optional(),
    dailyWaterIntake: optionalLongText(120),
    diet: optionalLongText(300),
    physicalActivity: optionalBoolean,
    workoutsPerWeek: z.union([z.number().int().min(0).max(7), z.null()]).optional(),
    sleepQuality: z.union([sleepQualitySchema, z.literal('')]).optional(),
  }),
  aestheticEvaluation: z.object({
    skinType: z.union([skinTypeSchema, z.literal('')]).optional(),
    fitzpatrick: z.union([fitzpatrickSchema, z.literal('')]).optional(),
    conditions: z.array(anamnesisConditionSchema).optional(),
    observedConditions: z.object({
      wrinkles: optionalBoolean,
      sagging: optionalBoolean,
      spots: optionalBoolean,
      scars: optionalBoolean,
      localizedFat: optionalBoolean,
      cellulite: optionalBoolean,
      stretchMarks: optionalBoolean,
    }).optional(),
  }),
  aestheticHistory: z.object({
    hadAestheticProcedures: optionalBoolean,
    procedureDetails: optionalLongText(600),
    lastProcedureDate: optionalLongText(120),
    adverseReaction: optionalBoolean,
  }).optional(),
  contraindications: z.object({
    pregnancy: optionalBoolean,
    lactation: optionalBoolean,
    activeInfections: optionalBoolean,
    recentIsotretinoin: optionalBoolean,
    activeDermatologicalDiseases: optionalBoolean,
    metallicImplants: optionalBoolean,
    additionalNotes: optionalLongText(600),
  }),
  expectations: z.object({
    treatmentExpectations: optionalLongText(600),
    expectedResultTimeline: optionalLongText(200),
    awareOfLimitations: optionalBoolean,
  }),
  treatmentObjective: optionalLongText(600),
  photoRecord: z.object({
    photos: z.array(anamnesisPhotoSchema).max(8).optional(),
    imageUseAuthorized: optionalBoolean,
    clinicalUseAuthorized: optionalBoolean,
    marketingUseAuthorized: optionalBoolean,
    consentAwarenessConfirmed: optionalBoolean,
    consentVersion: optionalLongText(80),
    consentAcceptedAt: optionalLongText(80),
  }),
  treatmentPlan: z.object({
    recommendedProcedure: optionalLongText(600),
    sessionCount: z.union([z.number().int().min(1).max(99), z.null()]).optional(),
    sessionInterval: optionalLongText(120),
    productsUsed: optionalLongText(600),
    equipmentsUsed: optionalLongText(600),
    services: z.array(treatmentPlanServiceSchema).optional(),
  }),
  scienceTerm: z.object({
    informedHistoryAccurately: optionalBoolean,
    awareOfRisks: optionalBoolean,
    receivedPreAndPostGuidance: optionalBoolean,
  }),
  signatures: z.object({
    patientSignatureDataUrl: optionalImageDataUrl,
    professionalSignatureDataUrl: optionalImageDataUrl,
    professionalId: z.number().int().positive().nullable().optional(),
    professionalName: z.string().trim().min(2).max(160),
    signedAt: z.string().min(1),
  }),
}).passthrough()

const anamnesisSchema = z.union([
  anamnesisAnswersSchema,
  z.object({ answers: anamnesisAnswersSchema }),
])

const consentRecordSchema = z.object({
  title: z.string().trim().min(4).optional(),
  versionLabel: z.string().trim().min(1).max(20).optional(),
})

const imageConsentRecordSchema = z.object({
  clinicalUseAuthorized: optionalBoolean,
  marketingUseAuthorized: optionalBoolean,
})

const consentRevocationSchema = z.object({
  reason: z.string().trim().max(600).optional(),
})

const consentSignatureSchema = z.object({
  signerName: z.string().trim().min(2),
  signerDocument: z.string().trim().optional(),
  professionalId: z.coerce.number().int().positive().nullable().optional(),
  professionalName: z.string().trim().max(160).optional(),
  signatureDataUrl: z.string().startsWith('data:image/').min(100),
  accepted: z.literal(true),
  status: consentStatusSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.professionalId && !value.professionalName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione ou informe o profissional responsável', path: ['professionalName'] })
  }
})

async function getAuditCorrectiveActionForRequest(userId, actionId) {
  const action = await prisma.auditCorrectiveAction.findFirst({
    where: { id: actionId, userId },
  })
  if (!action) {
    throw httpError(404, 'Ação corretiva não encontrada.')
  }
  return action
}

function buildAuditCorrectiveStatusDates(status) {
  const now = new Date()

  return {
    completedAt: status === 'DONE' ? now : null,
    dismissedAt: status === 'DISMISSED' ? now : null,
  }
}

function buildAuditCorrectiveActionData(data) {
  const normalized = {}

  if ('domainId' in data) normalized.domainId = data.domainId
  if ('title' in data) normalized.title = data.title?.trim() || null
  if ('owner' in data) normalized.owner = data.owner?.trim() || null
  if ('dueLabel' in data) normalized.dueLabel = data.dueLabel?.trim() || null
  if ('dueAt' in data) normalized.dueAt = data.dueAt ? parseDateOnly(data.dueAt) : null
  if ('evidence' in data) normalized.evidence = data.evidence?.trim() || null
  if ('actionUrl' in data) normalized.actionUrl = data.actionUrl?.trim() || null
  if ('riskLevel' in data) normalized.riskLevel = data.riskLevel
  if ('status' in data) {
    normalized.status = data.status
    Object.assign(normalized, buildAuditCorrectiveStatusDates(data.status))
  }

  return normalized
}

module.exports = {
  // Constants
  SUPPORT_ADMIN_EMAIL,
  SUPPORT_ADMIN_PASSWORD,
  SUPPORT_ADMIN_NAME,
  SUPPORT_CONTACT_NAME,
  SUPPORT_CONTACT_EMAIL,
  SUPPORT_CONTACT_PHONE,
  IMAGE_CONSENT_TITLE,
  IMAGE_CONSENT_VERSION,
  userAggregateInclude,
  auditCorrectiveActionAttachmentSelect,
  auditCorrectiveActionInclude,
  
  // Helpers
  httpError,
  sanitizeString,
  sanitizeObject,
  decimalEqual,
  mapBillingStatusToClinicStatus,
  buildClinicAggregateSeed,
  mergeLegacyUserAggregate,
  ensureClinicAggregate,
  getRequestClinicId,
  getScopedRequestUserId,
  getAuditCorrectiveUserId,
  createAuditLog,
  createAuditLogFromRequest,
  serializeAuditLog,
  serializeAuditCorrectiveActionAttachment,
  serializeAuditCorrectiveActionAttachmentFile,
  serializeAuditCorrectiveAction,
  signToken,
  signRefreshToken,
  parseId,
  parseDateTime,
  parseDateOnly,
  toDateOnlyIso,
  sanitizeCpf,
  calculateAgeFromDate,
  startOfMonth,
  startOfNextMonth,
  addDays,
  isTimeLabel,
  parseDecimalValue,
  getRequestIp,
  buildDefaultConsentTerm,
  buildImageConsentTerm,
  summarizeConsentRecord,
  summarizeAnamnesis,
  normalizeProfessionalAvailability,
  buildAvailabilitySummary,
  buildProfessionalCompensationSummary,
  buildProfessionalPayrollMetrics,
  normalizeProfessionalDocumentLookupValue,
  findMatchingProfessionalDocumentForRequirement,
  getProfessionalDocumentRequirementScore,
  summarizeProfessionalDocument,
  buildProfessionalDocumentsDashboard,
  summarizeProfessional,
  sanitizeFileName,
  formatDateTimeLabel,
  createPdfDocument,
  sendPdfDocument,
  renderPdfHeader,
  renderPdfSectionTitle,
  renderPdfField,
  renderPdfParagraphs,
  extractDataUrlImageBuffer,
  renderConsentRecordPdf,
  renderServicePopPdf,
  renderClientMedicalRecordPdf,
  normalizeClientData,
  normalizeProfessionalData,
  normalizeProfessionalDocumentData,
  normalizeServiceData,
  normalizeOptionalText,
  normalizeOptionalChoice,
  normalizeOptionalBoolean,
  normalizeAnamnesisPhotos,
  normalizeAnamnesisNonNegativeInteger,
  normalizeAnamnesisPositiveInteger,
  normalizeAestheticHistoryEntries,
  normalizeAnamnesisConditionList,
  buildObservedConditionsFromConditionList,
  normalizeTreatmentServices,
  normalizeAnamnesisData,
  buildAuditCorrectiveStatusDates,
  buildAuditCorrectiveActionData,
  getAuditCorrectiveActionForRequest,
  getProntuarioLockMessage,
  getClientProntuarioStatus,
  assertClientProntuarioEditable,
  ensureClientOwnership,
  ensureEditableClientOwnership,
  ensureServiceOwnership,
  ensureProfessionalOwnership,
  ensureProfessionalDocumentOwnership,
  ensureConsentRecordOwnership,
  ensureEditableConsentRecordOwnership,
  validateImageUploadSafety,
  validateAttachmentUploadSafety,
  clinicOperationalScopeCatalog,
  getDocumentStatus,
  
  // Zod schemas
  registerSchema,
  loginSchema,
  publicLeadSchema,
  clinicProfileSchema,
  auditCorrectiveActionSchema,
  auditCorrectiveActionPatchSchema,
  auditCorrectiveActionAttachmentSchema,
  clientSchema,
  professionalSchema,
  professionalDocumentSchema,
  serviceSchema,
  appointmentSchema,
  paymentSchema,
  anamnesisPhotoSchema,
  anamnesisAnswersSchema,
  anamnesisSchema,
  consentRecordSchema,
  imageConsentRecordSchema,
  consentRevocationSchema,
  consentSignatureSchema,
  
  // Support re-exports
  buildSupportUser,
  getSupportBillingSnapshot,
  getSupportContact,
  isSupportPayload,
  createSupportLoginResponse,
  serializeUser,
  serializeSupportUser,
  getBillingSnapshot,
  hasSupportBillingControl,
  hasSupportCredentials,
}
