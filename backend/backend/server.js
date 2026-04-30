require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const PDFDocument = require('pdfkit')
const { PrismaClient, Prisma } = require('@prisma/client')
const { z } = require('zod')
const { passwordPolicyMessage, passwordMeetsPolicy, safeEqualText } = require('./lib/security')
const { assertProductionReady, securityHeaders } = require('./lib/production-readiness')
const { hasSupportBillingControl } = require('./lib/supportAccess')
const { createApiV2Router } = require('./src/api-v2/createApiV2Router')
const { buildDocumentDashboard, registerDocumentRoutes } = require('./src/legacy/documents')
const { registerIntercurrenceRoutes } = require('./src/legacy/intercurrences')
const { registerBillingRoutes } = require('./src/legacy/billing')
const { registerBillingGatewayRoutes } = require('./src/legacy/billingGateway')
const { startAutomaticBillingJob } = require('./src/legacy/billingAutomation')
const { buildSupportUser, createSupportLoginResponse, getSupportBillingSnapshot, getSupportContact, hasSupportCredentials, isSupportPayload, registerSupportRoutes, requireSupport } = require('./src/legacy/support')
const { buildInventoryDashboard, registerInventoryRoutes } = require('./src/legacy/inventory')
const { registerAppointmentRoutes } = require('./src/legacy/appointments')
const { ensureServicePopForService, registerServiceRoutes } = require('./src/legacy/services')
const { registerPaymentRoutes } = require('./src/legacy/payments')
const { createAppointmentConfirmationJob, registerWhatsAppRoutes } = require('./src/legacy/whatsapp')
const { buildClinicalInsights } = require('./src/legacy/clinicalInsights')
const { registerPrivacyRoutes } = require('./src/legacy/privacy')

const app = express()
const prisma = new PrismaClient()

app.use(securityHeaders)

const FRONTEND_URLS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || FRONTEND_URLS.length === 0 || FRONTEND_URLS.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error('Origem nÃ£o permitida pelo CORS'))
  },
  credentials: false,
}))
app.use(express.json({
  limit: '8mb',
  verify(req, _res, buf) {
    if (req.originalUrl?.startsWith('/webhooks/whatsapp')) {
      req.rawBody = Buffer.from(buf)
    }
  },
}))

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET nÃ£o definido no .env')

const emailField = z.string().trim().email()
const appointmentStatusSchema = z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
const paymentStatusSchema = z.enum(['PENDING', 'PAID', 'REFUNDED', 'CANCELLED'])
const consentStatusSchema = z.enum(['PENDING', 'SIGNED', 'REVOKED'])
const professionalContractTypeSchema = z.enum(['CLT', 'PJ', 'AUTONOMA', 'COMISSIONADA', 'PARCERIA'])
const professionalPaymentModelSchema = z.enum(['FIXED', 'COMMISSION', 'HYBRID', 'DAILY'])

const professionalWeekdayLabels = {
  MONDAY: 'Segunda',
  TUESDAY: 'TerÃ§a',
  WEDNESDAY: 'Quarta',
  THURSDAY: 'Quinta',
  FRIDAY: 'Sexta',
  SATURDAY: 'SÃ¡bado',
  SUNDAY: 'Domingo',
}

const professionalWeekdays = Object.keys(professionalWeekdayLabels)

const professionalContractTypeLabels = {
  CLT: 'CLT',
  PJ: 'PJ',
  AUTONOMA: 'AutÃ´noma',
  COMISSIONADA: 'Comissionada',
  PARCERIA: 'Parceria',
}

const professionalPaymentModelLabels = {
  FIXED: 'Fixo',
  COMMISSION: 'ComissÃ£o',
  HYBRID: 'Fixo + comissÃ£o',
  DAILY: 'DiÃ¡ria',
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const SUPPORT_ADMIN_EMAIL = (process.env.SUPPORT_ADMIN_EMAIL || '').trim().toLowerCase()
const SUPPORT_ADMIN_PASSWORD = process.env.SUPPORT_ADMIN_PASSWORD || ''
const SUPPORT_ADMIN_NAME = (process.env.SUPPORT_ADMIN_NAME || 'Central de suporte').trim()
const SUPPORT_CONTACT_NAME = (process.env.SUPPORT_CONTACT_NAME || SUPPORT_ADMIN_NAME || "Suporte L'Appui").trim()
const SUPPORT_CONTACT_EMAIL = (process.env.SUPPORT_CONTACT_EMAIL || SUPPORT_ADMIN_EMAIL || '').trim()
const SUPPORT_CONTACT_PHONE = (process.env.SUPPORT_CONTACT_PHONE || '').trim()

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

const userAggregateInclude = {
  ownedClinic: {
    include: {
      subscription: true,
    },
  },
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

function decimalEqual(left, right) {
  const leftValue = left === null || left === undefined ? null : String(left)
  const rightValue = right === null || right === undefined ? null : String(right)
  return leftValue === rightValue
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

function getAuditActorData(req) {
  if (req.user?.impersonatedBySupport || req.user?.support) {
    return {
      actorUserId: null,
      actorEmail: req.user.supportEmail || req.user.email || SUPPORT_ADMIN_EMAIL || null,
      actorRole: 'SUPPORT',
    }
  }

  return {
    actorUserId: req.currentUser?.id || req.user?.id || null,
    actorEmail: req.currentUser?.email || req.user?.email || null,
    actorRole: req.currentUser?.role || req.user?.role || null,
  }
}

async function createAuditLog(entry) {
  return prisma.auditLog.create({
    data: {
      clinicId: entry.clinicId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorEmail: entry.actorEmail ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
      metadata: entry.metadata ?? null,
    },
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

function requireSupportBillingControl(req, res, next) {
  if (req.user?.impersonatedBySupport) {
    return next()
  }

  if (req.user?.support) {
    return res.status(409).json({ error: 'Selecione uma clÃ­nica na central de suporte para alterar ou confirmar a assinatura.' })
  }

  return res.status(403).json({ error: 'Somente o login de suporte pode alterar valor ou confirmar pagamento da assinatura.' })
}

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res)
    } catch (error) {
      next(error)
    }
  }
}

async function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization || ''

  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente.' })
  }

  const token = authorization.slice('Bearer '.length).trim()

  if (!token) {
    return res.status(401).json({ error: 'Token ausente.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)

    if (isSupportPayload(payload, SUPPORT_ADMIN_EMAIL)) {
      req.user = {
        ...payload,
        support: true,
      }
      req.currentUser = buildSupportUser({
        supportAdminEmail: SUPPORT_ADMIN_EMAIL,
        supportAdminName: SUPPORT_ADMIN_NAME,
      })
      req.billing = getSupportBillingSnapshot()
      req.supportContext = null
      return next()
    }

    const userId = parseId(payload.id, 'userId')
    const aggregateUser = await ensureClinicAggregate(userId)

    req.user = {
      ...payload,
      id: aggregateUser.id,
      email: aggregateUser.email,
      role: aggregateUser.role,
      support: false,
    }
    req.currentUser = aggregateUser
    req.billing = getBillingSnapshot(aggregateUser)
    req.supportContext = payload.impersonatedBySupport
      ? {
        active: true,
        supportEmail: payload.supportEmail || SUPPORT_ADMIN_EMAIL,
        supportName: payload.supportName || SUPPORT_ADMIN_NAME,
      }
      : null

    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Token invÃ¡lido.' })
  }
}

function parseId(value, fieldName = 'id') {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} invÃ¡lido.`)
  }

  return parsed
}

function parseDateTime(value, fieldName) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw httpError(422, `${fieldName} invÃ¡lido.`)
  }

  return date
}

function parseDateOnly(value, fieldName) {
  if (!value) return null

  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw httpError(422, `${fieldName} invÃ¡lido.`)
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
    throw httpError(422, `${fieldName} invÃ¡lido.`)
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
    `Eu, ${clientName}, declaro que fui orientado(a) pela equipe da ${clinicName} sobre o atendimento estÃ©tico proposto, seus objetivos, possÃ­veis desconfortos, cuidados e riscos esperados.`,
    '',
    'Confirmo que informei com veracidade meu histÃ³rico de saÃºde, alergias, medicamentos em uso, procedimentos anteriores e demais informaÃ§Ãµes relevantes para a seguranÃ§a do atendimento.',
    '',
    'Autorizo a realizaÃ§Ã£o do procedimento conforme avaliaÃ§Ã£o profissional e compreendo que posso interromper ou solicitar esclarecimentos a qualquer momento.',
    '',
    'Estou ciente de que resultados variam conforme caracterÃ­sticas individuais, adesÃ£o Ã s orientaÃ§Ãµes e resposta biolÃ³gica ao tratamento.',
    '',
    'Autorizo o registro destas informaÃ§Ãµes no prontuÃ¡rio da clÃ­nica para fins assistenciais, legais e de rastreabilidade.',
    '',
    'Li o conteÃºdo acima, tive oportunidade de tirar dÃºvidas e declaro meu consentimento livre e esclarecido.',
  ].join('\n')
}




const IMAGE_CONSENT_TITLE = 'Termo de autorizaÃ§Ã£o de uso de imagem'
const IMAGE_CONSENT_VERSION = 'imagem-v1'

function buildImageConsentTerm({ clinicName, clientName, clinicalUseAuthorized = true, marketingUseAuthorized = false }) {
  const resolvedClinicName = clinicName || "L'Appui"
  const resolvedClientName = clientName || 'cliente'
  const clinicalDecision = clinicalUseAuthorized
    ? 'AUTORIZO o registro, armazenamento e uso das minhas imagens exclusivamente para acompanhamento clÃ­nico, evoluÃ§Ã£o do tratamento, prontuÃ¡rio e documentaÃ§Ã£o tÃ©cnica interna.'
    : 'NÃƒO AUTORIZO o uso das minhas imagens para acompanhamento clÃ­nico, salvo quando exigido por obrigaÃ§Ã£o legal ou regulatÃ³ria.'
  const marketingDecision = marketingUseAuthorized
    ? 'AUTORIZO tambÃ©m o uso das imagens para comunicaÃ§Ã£o institucional, portfÃ³lio, redes sociais e materiais de divulgaÃ§Ã£o da clÃ­nica, desde que respeitados dignidade, contexto e privacidade.'
    : 'NÃƒO AUTORIZO o uso das minhas imagens em marketing, redes sociais, anÃºncios, portfÃ³lio pÃºblico ou qualquer divulgaÃ§Ã£o externa.'

  return [
    'Eu, ' + resolvedClientName + ', declaro que recebi explicaÃ§Ã£o clara da ' + resolvedClinicName + ' sobre o uso de imagens no contexto do atendimento estÃ©tico.',
    '',
    '1. Uso clÃ­nico e prontuÃ¡rio',
    clinicalDecision,
    '',
    '2. Uso externo, divulgaÃ§Ã£o e marketing',
    marketingDecision,
    '',
    '3. Guarda, sigilo e seguranÃ§a',
    'As imagens devem permanecer vinculadas ao prontuÃ¡rio da cliente, com acesso restrito aos profissionais autorizados e registro de finalidade.',
    '',
    '4. RevogaÃ§Ã£o',
    'A cliente pode solicitar a revogaÃ§Ã£o futura desta autorizaÃ§Ã£o. A revogaÃ§Ã£o nÃ£o altera registros clÃ­nicos jÃ¡ produzidos de forma legÃ­tima, mas impede novos usos nÃ£o autorizados.',
    '',
    '5. CiÃªncia',
    'Declaro que li, compreendi e assino este termo de forma livre, consciente e informada.',
    '',
    'ClÃ­nica responsÃ¡vel: ' + resolvedClinicName + '.',
    'VersÃ£o do termo: ' + IMAGE_CONSENT_VERSION + '.',
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

      return {
        day: slot.day,
        enabled,
        start,
        end,
      }
    })

  const ordered = professionalWeekdays.map(day => (
    mapped.find(slot => slot.day === day) || {
      day,
      enabled: false,
      start: '09:00',
      end: '18:00',
    }
  ))

  return ordered
}

function buildAvailabilitySummary(availability) {
  const normalized = normalizeProfessionalAvailability(availability) || []
  const activeDays = normalized.filter(slot => slot.enabled)

  if (!activeDays.length) {
    return 'Disponibilidade ainda nÃ£o configurada.'
  }

  return activeDays
    .map(slot => `${professionalWeekdayLabels[slot.day]} ${slot.start} Ã s ${slot.end}`)
    .join(' | ')
}

function buildProfessionalCompensationSummary(record) {
  if (!record?.paymentModel && !record?.salaryAmount && !record?.commissionRate) {
    return 'Folha de pagamento ainda nÃ£o configurada.'
  }

  const parts = []

  if (record.paymentModel) {
    parts.push(professionalPaymentModelLabels[record.paymentModel] || record.paymentModel)
  }

  if (record.salaryAmount != null) {
    parts.push(`Base ${Number(record.salaryAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  }

  if (record.commissionRate != null) {
    parts.push(`ComissÃ£o ${Number(record.commissionRate).toLocaleString('pt-BR')}%`)
  }

  if (record.paymentDay != null) {
    parts.push(`Repasse dia ${record.paymentDay}`)
  }

  return parts.join(' â€¢ ')
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
  const commissionAmount = Number(((paidRevenue * commissionRate) / 100).toFixed(2))
  const workedDays = uniqueWorkedDays.size

  let projectedPayout = 0
  switch (professional.paymentModel) {
    case 'FIXED':
      projectedPayout = fixedAmount
      break
    case 'COMMISSION':
      projectedPayout = commissionAmount
      break
    case 'HYBRID':
      projectedPayout = fixedAmount + commissionAmount
      break
    case 'DAILY':
      projectedPayout = fixedAmount * workedDays
      break
    default:
      projectedPayout = fixedAmount || commissionAmount
      break
  }

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
    projectedPayout: Number(projectedPayout.toFixed(2)),
    lastPaidAt: latestPaidRecord?.paidAt || null,
  }
}

function summarizeProfessional(record) {
  if (!record) return null

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
    paymentDay: record.paymentDay,
    payrollNotes: record.payrollNotes,
    compensationSummary: buildProfessionalCompensationSummary(record),
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
  if (!value) return 'NÃ£o informado'

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
    renderPdfSectionTitle(doc, 'Aviso de geraÃ§Ã£o')
    doc.fillColor('#2d2117').fontSize(11).text(
      'O PDF foi gerado com conteÃºdo parcial porque uma seÃ§Ã£o encontrou inconsistÃªncia. Revise os dados e gere novamente, se necessÃ¡rio.'
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
  doc.fillColor('#2d2117').fontSize(11).text(value || 'NÃ£o informado', {
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
    subtitle: `Documento clÃ­nico vinculado ao prontuÃ¡rio de ${record.client.name}.`,
  })

  renderPdfSectionTitle(doc, 'IdentificaÃ§Ã£o e rastreabilidade')
  renderPdfField(doc, 'ClÃ­nica', clinicName || "L'Appui")
  renderPdfField(doc, 'Cliente', record.client.name)
  renderPdfField(doc, 'Status', record.status === 'SIGNED' ? 'Assinado' : record.status === 'REVOKED' ? 'Revogado' : 'Pendente')
  renderPdfField(doc, 'VersÃ£o', record.versionLabel || 'v1')
  renderPdfField(doc, 'Gerado em', formatDateTimeLabel(record.createdAt))
  renderPdfField(doc, 'Assinado em', formatDateTimeLabel(record.signedAt))
  renderPdfField(doc, 'Documento do assinante', record.signerDocument || record.client.cpf || 'NÃ£o informado')
  renderPdfField(doc, 'Profissional responsÃ¡vel', record.professionalName || 'NÃ£o informado')

  renderPdfSectionTitle(doc, 'ConteÃºdo do termo')
  renderPdfParagraphs(doc, record.termText)

  doc.moveDown(0.5)
  renderPdfSectionTitle(doc, 'EvidÃªncia de assinatura')
  renderPdfField(doc, 'Nome de quem assinou', record.signerName || record.client.name)
  renderPdfField(doc, 'Hash da assinatura', record.signatureHash || 'Ainda nÃ£o gerado')
  renderPdfField(doc, 'IP do registro', record.signedIp || 'NÃ£o registrado')
  renderPdfField(doc, 'Navegador', record.signedUserAgent || 'NÃ£o registrado')

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
      console.error('NÃ£o foi possÃ­vel renderizar a imagem da assinatura no PDF:', error)
      doc.fillColor('#6f6154').fontSize(10).text('A imagem da assinatura nÃ£o pÃ´de ser incorporada ao PDF, mas o registro textual foi preservado.')
    }
  } else {
    doc.fillColor('#6f6154').fontSize(10).text('Nenhuma imagem de assinatura foi anexada a este registro.')
  }
}

function renderServicePopPdf(doc, { clinicName, service, pop }) {
  renderPdfHeader(doc, {
    eyebrow: "L'APPUI | POP DO PROCEDIMENTO",
    title: pop.title,
    subtitle: `Procedimento ${service.name} com versÃ£o pronta para consulta, impressÃ£o e rastreabilidade.`, 
  })

  renderPdfSectionTitle(doc, 'Dados do procedimento')
  renderPdfField(doc, 'ClÃ­nica', clinicName)
  renderPdfField(doc, 'Procedimento', service.name)
  renderPdfField(doc, 'Tempo mÃ©dio', service.duration ? `${service.duration} minutos` : 'Conforme avaliaÃ§Ã£o')
  renderPdfField(doc, 'Ãšltima atualizaÃ§Ã£o', formatDateTimeLabel(pop.updatedAt))

  renderPdfSectionTitle(doc, 'ConteÃºdo do POP')
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
    message = 'Acesso da clÃ­nica bloqueado atÃ© a confirmaÃ§Ã£o do pagamento.'
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
  return 'ProntuÃ¡rio bloqueado apÃ³s confirmaÃ§Ã£o de pagamento. Apenas visualizaÃ§Ã£o dos dados e download em PDF estÃ£o disponÃ­veis.'
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
  return prisma.client.findFirstOrThrow({ where: { id: clientId, userId } })
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
  if ('paymentDay' in data) normalized.paymentDay = data.paymentDay || null
  if ('payrollNotes' in data) normalized.payrollNotes = data.payrollNotes?.trim() || null
  if ('active' in data) normalized.active = data.active

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
      procedureName: normalizeOptionalText(legacyAestheticHistory.procedureDetails) || 'Procedimento estÃ©tico anterior',
      procedureDate: normalizeOptionalText(legacyAestheticHistory.lastProcedureDate),
      notes: normalizeOptionalBoolean(legacyAestheticHistory.hadAestheticProcedures)
        ? 'Paciente relata histÃ³rico de procedimentos estÃ©ticos anteriores.'
        : '',
      intercurrences: normalizeOptionalBoolean(legacyAestheticHistory.adverseReaction)
        ? 'Paciente informou reaÃ§Ã£o adversa em procedimento anterior.'
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
      name: normalizeOptionalText(treatmentPlan.recommendedProcedure) || 'Protocolo estÃ©tico recomendado',
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
    eyebrow: 'ProntuÃ¡rio clÃ­nico',
    title: client.name || 'Cliente',
    subtitle: clinicName ? `ClÃ­nica ${clinicName}` : 'Resumo consolidado do atendimento',
  })

  renderPdfSectionTitle(doc, 'Status do prontuÃ¡rio')
  renderPdfField(doc, 'Pagamento confirmado', prontuarioStatus.isPaid ? 'Sim' : 'NÃ£o')
  renderPdfField(doc, 'Bloqueado para ediÃ§Ã£o', prontuarioStatus.isLocked ? 'Sim' : 'NÃ£o')
  renderPdfField(doc, 'Bloqueado em', formatDateTimeLabel(prontuarioStatus.lockedAt))

  renderPdfSectionTitle(doc, 'Cadastro do cliente')
  renderPdfField(doc, 'Nome completo', client.name)
  renderPdfField(doc, 'CPF', client.cpf)
  renderPdfField(doc, 'Telefone', client.phone)
  renderPdfField(doc, 'E-mail', client.email)
  renderPdfField(doc, 'Nascimento', formatDateTimeLabel(client.birthDate))
  renderPdfField(doc, 'ProfissÃ£o', client.profession)
  renderPdfField(doc, 'Estado civil', client.maritalStatus)
  renderPdfField(doc, 'Sexo', client.sex)
  renderPdfField(doc, 'EndereÃ§o', client.addressFull)
  renderPdfField(doc, 'ObservaÃ§Ãµes cadastrais', client.notes)

  renderPdfSectionTitle(doc, 'Anamnese mais recente')
  if (!latestAnamnesis) {
    renderPdfParagraphs(doc, 'Nenhuma anamnese registrada para este cliente.')
  } else {
    renderPdfField(doc, 'VersÃ£o mais recente', formatDateTimeLabel(latestAnamnesis.filledAt))
    renderPdfField(doc, 'Queixa principal', chiefComplaint.currentDiscomfort)
    renderPdfField(doc, 'Procedimento desejado', chiefComplaint.desiredProcedure)
    renderPdfField(doc, 'Tempo de percepÃ§Ã£o', chiefComplaint.complaintDuration)
    renderPdfField(doc, 'Tratamento anterior', chiefComplaint.previousTreatment)
    renderPdfField(doc, 'Expectativas', expectations.treatmentExpectations)
    renderPdfField(doc, 'Objetivo do tratamento', answers.treatmentObjective)
    renderPdfField(doc, 'Prazo esperado para resultado', expectations.expectedResultTimeline)
    renderPdfField(doc, 'Ciente das limitaÃ§Ãµes', expectations.awareOfLimitations ? 'Sim' : 'NÃ£o')
    renderPdfField(doc, 'Atividade fÃ­sica por semana', lifestyle.workoutsPerWeek)
    renderPdfField(doc, 'Sono', lifestyle.sleepQuality)
    renderPdfField(doc, 'Ãgua por dia', lifestyle.dailyWaterIntake)
    renderPdfField(doc, 'AlimentaÃ§Ã£o', lifestyle.diet)
    renderPdfField(doc, 'Tabagismo', lifestyle.smoking ? 'Sim' : 'NÃ£o')
    renderPdfField(doc, 'Consumo de Ã¡lcool', lifestyle.alcoholConsumption ? 'Sim' : 'NÃ£o')
    renderPdfField(doc, 'FrequÃªncia do Ã¡lcool', lifestyle.alcoholFrequency)
    renderPdfField(doc, 'Tipo de pele', aestheticEvaluation.skinType)
    renderPdfField(doc, 'Fototipo de Fitzpatrick', aestheticEvaluation.fitzpatrick)
    renderPdfField(
      doc,
      'CondiÃ§Ãµes observadas',
      conditions.length
        ? conditions.map(condition => condition.classification ? `${condition.label} (${condition.classification})` : condition.label).join(', ')
        : 'Nenhuma condiÃ§Ã£o classificada'
    )
    renderPdfField(doc, 'Fotos clÃ­nicas anexadas', photoCount ? `${photoCount} registro(s)` : 'Nenhum registro')
    renderPdfField(doc, 'Uso clÃ­nico de imagem', clinicalPhotoConsent ? 'Sim' : 'NÃ£o')
    renderPdfField(doc, 'Uso em marketing', marketingPhotoConsent ? 'Sim' : 'NÃ£o')
  }

  if (aestheticHistory.length) {
    renderPdfSectionTitle(doc, 'HistÃ³rico estÃ©tico')
    aestheticHistory.forEach((entry, index) => {
      renderPdfField(doc, `Procedimento ${index + 1}`, entry.procedureName)
      renderPdfField(doc, 'Data aproximada', entry.procedureDate)
      renderPdfField(doc, 'ObservaÃ§Ãµes', entry.notes)
      renderPdfField(doc, 'IntercorrÃªncias', entry.intercurrences)
    })
  }

  if (treatmentServices.length || treatmentPlan.recommendedProcedure || treatmentPlan.productsUsed || treatmentPlan.equipmentsUsed) {
    renderPdfSectionTitle(doc, 'Plano de tratamento')
    renderPdfField(doc, 'Procedimento indicado', treatmentPlan.recommendedProcedure)
    renderPdfField(doc, 'SessÃµes planejadas', treatmentPlan.sessionCount)
    renderPdfField(doc, 'Intervalo entre sessÃµes', treatmentPlan.sessionInterval)
    renderPdfField(doc, 'Produtos utilizados', treatmentPlan.productsUsed)
    renderPdfField(doc, 'Equipamentos utilizados', treatmentPlan.equipmentsUsed)

    treatmentServices.forEach((service, index) => {
      renderPdfField(doc, `ServiÃ§o ${index + 1}`, service.name)
      renderPdfField(doc, 'SessÃµes deste serviÃ§o', service.sessions)
      renderPdfField(doc, 'DescriÃ§Ã£o clÃ­nica', service.description)
      renderPdfField(doc, 'Efeitos adversos esperados', service.adverseEffects)
    })
  }

  renderPdfSectionTitle(doc, 'CiÃªncia e assinaturas')
  renderPdfField(doc, 'HistÃ³rico informado corretamente', scienceTerm.informedHistoryAccurately ? 'Sim' : 'NÃ£o')
  renderPdfField(doc, 'Ciente dos riscos', scienceTerm.awareOfRisks ? 'Sim' : 'NÃ£o')
  renderPdfField(doc, 'Recebeu orientaÃ§Ãµes prÃ© e pÃ³s', scienceTerm.receivedPreAndPostGuidance ? 'Sim' : 'NÃ£o')
  renderPdfField(doc, 'Profissional responsÃ¡vel', signatures.professionalName)
  renderPdfField(doc, 'Data da assinatura', signatures.signedAt)
  renderPdfField(doc, 'Assinatura do paciente', signatures.patientSignatureDataUrl ? 'Registrada' : 'NÃ£o registrada')
  renderPdfField(doc, 'Assinatura do profissional', signatures.professionalSignatureDataUrl ? 'Registrada' : 'NÃ£o registrada')

  renderPdfSectionTitle(doc, 'Consentimento')
  renderPdfField(doc, 'Status', latestConsent?.status || 'Sem termo')
  renderPdfField(doc, 'TÃ­tulo', latestConsent?.title)
  renderPdfField(doc, 'Assinado em', formatDateTimeLabel(latestConsent?.signedAt))
  renderPdfField(doc, 'Profissional do termo', latestConsent?.professionalName)

  renderPdfSectionTitle(doc, 'Atendimentos recentes')
  if (!recentAppointments.length) {
    renderPdfParagraphs(doc, 'Nenhum atendimento recente vinculado a este cliente.')
    return
  }

  recentAppointments.forEach((appointment, index) => {
    renderPdfField(doc, `Atendimento ${index + 1}`, formatDateTimeLabel(appointment.startAt))
    renderPdfField(doc, 'ServiÃ§o', appointment.service?.name)
    renderPdfField(doc, 'Profissional', appointment.professional?.name)
    renderPdfField(doc, 'Status', appointment.status)
    renderPdfField(doc, 'Pagamento', appointment.payment?.status || 'Sem pagamento')
    renderPdfField(doc, 'ObservaÃ§Ãµes', appointment.notes)
  })
}

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
const clinicProfileSchema = z.object({
  clinicName: z.string().trim().min(2).max(120).optional(),
  clinicLogoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(1_000_000), z.null()]).optional(),
})
const clientSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  email: z.union([z.literal(''), emailField]).optional(),
  birthDate: z.string().optional(),
  cpf: z.string().trim().optional(),
  photoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(8_000_000), z.null()]).optional(),
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
  photoDataUrl: z.union([z.string().trim().startsWith('data:image/').max(8_000_000), z.null()]).optional(),
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
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  payrollNotes: z.string().trim().max(1200).optional(),
  active: z.boolean().optional(),
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione ou informe o profissional responsÃ¡vel', path: ['professionalName'] })
  }
})
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ ok: true, database: 'reachable', ts: new Date().toISOString() })
  } catch {
    return res.status(503).json({ ok: false, database: 'unreachable', ts: new Date().toISOString() })
  }
})

registerSupportRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  requireSupport,
  ensureClinicAggregate,
  userAggregateInclude,
  mergeLegacyUserAggregate,
  serializeUser,
  createAuditLogFromRequest,
  signToken,
  supportAdminEmail: SUPPORT_ADMIN_EMAIL,
  supportAdminName: SUPPORT_ADMIN_NAME,
  supportContactName: SUPPORT_CONTACT_NAME,
  supportContactEmail: SUPPORT_CONTACT_EMAIL,
  supportContactPhone: SUPPORT_CONTACT_PHONE,
})

app.post('/public/leads', handle(async (req, res) => {
  const data = publicLeadSchema.parse(req.body)

  const lead = await prisma.marketingLead.create({
    data: {
      clinicName: data.clinicName.trim(),
      contactName: data.contactName.trim(),
      email: data.email.toLowerCase(),
      phone: data.phone.trim(),
      city: data.city?.trim() || null,
      teamSize: data.teamSize?.trim() || null,
      mainGoal: data.mainGoal?.trim() || null,
      message: data.message?.trim() || null,
      requestedDemo: data.requestedDemo ?? true,
      source: data.source?.trim() || null,
    },
  })

  res.status(201).json({
    ok: true,
    leadId: lead.id,
    message: 'Recebemos seu interesse e vamos retornar com uma apresentaÃ§Ã£o em breve.',
  })
}))

app.post('/auth/register', handle(async (req, res) => {
  const data = registerSchema.parse(req.body)
  const email = data.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    return res.status(409).json({ error: 'E-mail ja cadastrado.' })
  }

  const hashedPassword = await bcrypt.hash(data.password, 12)
  const createdUser = await prisma.user.create({
    data: {
      email,
      hashedPassword,
      clinicName: data.clinicName,
      billingStatus: 'TRIAL',
      billingGraceEndsAt: addDays(new Date(), 7),
    },
  })

  const user = await ensureClinicAggregate(createdUser.id)

  await createAuditLog({
    clinicId: user.ownedClinic?.id || null,
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'AUTH_REGISTER',
    entityType: 'Clinic',
    entityId: user.ownedClinic?.id || null,
    metadata: {
      email: user.email,
      clinicName: user.clinicName,
    },
  })

  const token = signToken({ id: user.id, email: user.email, role: user.role })
  res.status(201).json({
    token,
    user: serializeUser(user),
  })
}))

app.post('/auth/login', handle(async (req, res) => {
  const data = loginSchema.parse(req.body)
  const email = data.email.toLowerCase()
  const supportLoginResponse = createSupportLoginResponse({
    email,
    password: data.password,
    supportAdminEmail: SUPPORT_ADMIN_EMAIL,
    supportAdminPassword: SUPPORT_ADMIN_PASSWORD,
    supportAdminName: SUPPORT_ADMIN_NAME,
    safeEqualText,
    signToken,
    serializeSupportUser,
  })

  if (supportLoginResponse) {
    return res.status(supportLoginResponse.status).json(supportLoginResponse.body)
  }

  const userRecord = await prisma.user.findUnique({ where: { email } })

  if (!userRecord) {
    return res.status(404).json({ error: 'Nenhuma conta encontrada para este e-mail.' })
  }

  const passwordMatches = await bcrypt.compare(data.password, userRecord.hashedPassword)
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciais invalidas.' })
  }

  const user = await ensureClinicAggregate(userRecord.id)
  const token = signToken({ id: user.id, email: user.email, role: user.role })
  res.json({
    token,
    user: serializeUser(user),
  })
}))

app.get('/auth/me', authMiddleware, handle(async (req, res) => {
  if (req.user?.support) {
    return res.json(serializeSupportUser())
  }

  res.json(serializeUser(req.currentUser, { supportContext: req.supportContext }))
}))
app.get('/clinic/profile', authMiddleware, handle(async (req, res) => {
  res.json(serializeUser(req.currentUser, { supportContext: req.supportContext }))
}))

app.put('/clinic/profile', authMiddleware, handle(async (req, res) => {
  const data = clinicProfileSchema.parse(req.body)

  await prisma.$transaction(async tx => {
    const nextClinicName = Object.prototype.hasOwnProperty.call(data, 'clinicName')
      ? (data.clinicName?.trim() || req.currentUser.clinicName)
      : req.currentUser.clinicName
    const nextLogo = Object.prototype.hasOwnProperty.call(data, 'clinicLogoDataUrl')
      ? (data.clinicLogoDataUrl?.trim() || null)
      : (req.currentUser.clinicLogoDataUrl || null)

    await tx.user.update({
      where: { id: req.currentUser.id },
      data: {
        clinicName: nextClinicName,
        clinicLogoDataUrl: nextLogo,
      },
    })

    if (req.currentUser.ownedClinic?.id) {
      await tx.clinic.update({
        where: { id: req.currentUser.ownedClinic.id },
        data: {
          name: nextClinicName,
          logoDataUrl: nextLogo,
        },
      })
    }
  })

  await createAuditLogFromRequest(req, {
    clinicId: getRequestClinicId(req),
    action: 'CLINIC_PROFILE_UPDATED',
    entityType: 'Clinic',
    entityId: getRequestClinicId(req) ? String(getRequestClinicId(req)) : null,
    metadata: {
      changedFields: Object.keys(data),
      clinicNameChanged: Object.prototype.hasOwnProperty.call(data, 'clinicName'),
      logoChanged: Object.prototype.hasOwnProperty.call(data, 'clinicLogoDataUrl'),
      sensitivePayloadStored: false,
    },
  })

  const user = await ensureClinicAggregate(req.currentUser.id)

  res.json(serializeUser(user, { supportContext: req.supportContext }))
}))
registerPrivacyRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  createAuditLogFromRequest,
  getRequestClinicId,
  httpError,
})

registerBillingRoutes({
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
  supportAdminName: SUPPORT_ADMIN_NAME,
  supportAdminEmail: SUPPORT_ADMIN_EMAIL,
  canManageSubscription: hasSupportBillingControl,
})

registerBillingGatewayRoutes({
  app,
  prisma,
  authMiddleware,
  requireSupportBillingControl,
  handle,
  parseDateOnly,
  addDays,
  ensureClinicAggregate,
  getBillingSnapshot,
  createAuditLogFromRequest,
  httpError,
})

registerDocumentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateOnly,
  createAuditLogFromRequest,
})
registerInventoryRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateOnly,
  createAuditLogFromRequest,
  getRequestClinicId,
})

app.get('/clients', authMiddleware, handle(async (req, res) => {
  const search = String(req.query.search || '').trim()

  const clients = await prisma.client.findMany({
    where: {
      userId: req.user.id,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      anamneses: {
        orderBy: { filledAt: 'desc' },
        take: 1,
      },
      consentRecords: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  res.json(clients.map(({ anamneses, consentRecords, ...client }) => ({
    ...client,
    latestAnamnesis: summarizeAnamnesis(anamneses[0]),
    latestConsentRecord: summarizeConsentRecord(consentRecords[0]),
  })))
}))

app.get('/clients/:id', authMiddleware, handle(async (req, res) => {
  const clientId = parseId(req.params.id, 'clientId')

  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, userId: req.user.id },
    include: {
      appointments: {
        include: { service: true, professional: true },
        orderBy: { startAt: 'desc' },
        take: 10,
      },
      anamneses: { orderBy: { filledAt: 'desc' }, take: 1 },
      consentRecords: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  res.json(client)
}))

app.post('/clients', authMiddleware, handle(async (req, res) => {
  const data = clientSchema.parse(req.body)
  const client = await prisma.client.create({ data: { ...normalizeClientData(data), userId: req.user.id } })
  res.status(201).json(client)
}))

app.put('/clients/:id', authMiddleware, handle(async (req, res) => {
  const clientId = parseId(req.params.id, 'clientId')
  const data = clientSchema.partial().parse(req.body)

  await ensureEditableClientOwnership(req.user.id, clientId)
  const client = await prisma.client.update({ where: { id: clientId }, data: normalizeClientData(data) })
  res.json(client)
}))

app.delete('/clients/:id', authMiddleware, handle(async (req, res) => {
  const clientId = parseId(req.params.id, 'clientId')
  await ensureEditableClientOwnership(req.user.id, clientId)
  await prisma.client.deleteMany({ where: { id: clientId, userId: req.user.id } })
  res.json({ ok: true })
}))

app.get('/professionals', authMiddleware, handle(async (req, res) => {
  const userId = getScopedRequestUserId(req)
  const list = await prisma.professional.findMany({
    where: { userId, active: true },
    orderBy: { name: 'asc' },
  })

  res.json(list.map(summarizeProfessional))
}))

app.get('/professionals/:id', authMiddleware, handle(async (req, res) => {
  const userId = getScopedRequestUserId(req)
  const professionalId = parseId(req.params.id, 'professionalId')
  const now = new Date()
  const periodStart = startOfMonth(now)
  const periodEnd = startOfNextMonth(now)

  const [professional, totalAppointments, completedAppointments, upcomingAppointments, periodAppointments] = await Promise.all([
    prisma.professional.findFirstOrThrow({
      where: { id: professionalId, userId, active: true },
      include: {
        appointments: {
          include: {
            client: { select: { id: true, name: true } },
            service: { select: { id: true, name: true, duration: true } },
            payment: { select: { amount: true, status: true, paidAt: true } },
          },
          orderBy: { startAt: 'desc' },
          take: 12,
        },
      },
    }),
    prisma.appointment.count({
      where: {
        userId,
        professionalId,
      },
    }),
    prisma.appointment.count({
      where: {
        userId,
        professionalId,
        status: 'COMPLETED',
      },
    }),
    prisma.appointment.count({
      where: {
        userId,
        professionalId,
        startAt: { gte: new Date() },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    }),
    prisma.appointment.findMany({
      where: {
        userId,
        professionalId,
        startAt: {
          gte: periodStart,
          lt: periodEnd,
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        payment: { select: { amount: true, status: true, paidAt: true } },
      },
    }),
  ])

  const payroll = buildProfessionalPayrollMetrics({
    professional,
    appointments: periodAppointments,
  })

  res.json({
    ...summarizeProfessional(professional),
    metrics: {
      totalAppointments,
      completedAppointments,
      upcomingAppointments,
    },
    payroll: {
      ...payroll,
      periodStart,
      periodEnd,
    },
    appointments: professional.appointments.map(appointment => ({
      id: appointment.id,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      notes: appointment.notes,
      price: appointment.price,
      client: appointment.client,
      service: appointment.service,
      payment: appointment.payment,
    })),
  })
}))

app.post('/professionals', authMiddleware, handle(async (req, res) => {
  const userId = getScopedRequestUserId(req)
  const data = professionalSchema.parse(req.body)
  const professional = await prisma.professional.create({ data: { ...normalizeProfessionalData(data), userId } })
  res.status(201).json(summarizeProfessional(professional))
}))

app.put('/professionals/:id', authMiddleware, handle(async (req, res) => {
  const userId = getScopedRequestUserId(req)
  const professionalId = parseId(req.params.id, 'professionalId')
  const data = professionalSchema.partial().parse(req.body)

  await prisma.professional.findFirstOrThrow({ where: { id: professionalId, userId } })
  const professional = await prisma.professional.update({ where: { id: professionalId }, data: normalizeProfessionalData(data) })
  res.json(summarizeProfessional(professional))
}))

app.delete('/professionals/:id', authMiddleware, handle(async (req, res) => {
  const userId = getScopedRequestUserId(req)
  const professionalId = parseId(req.params.id, 'professionalId')
  await prisma.professional.updateMany({ where: { id: professionalId, userId }, data: { active: false } })
  res.json({ ok: true })
}))
registerServiceRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  serviceSchema,
  normalizeServiceData,
  sanitizeFileName,
  sendPdfDocument,
  renderServicePopPdf,
  createAuditLogFromRequest,
  getRequestClinicId,
})


registerIntercurrenceRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  httpError,
  getAuditActorData,
  createAuditLogFromRequest,
  getRequestClinicId,
})

registerAppointmentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateTime,
  httpError,
  appointmentSchema,
  ensureEditableClientOwnership,
  ensureServiceOwnership,
  ensureProfessionalOwnership,
  assertClientProntuarioEditable,
})

registerPaymentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateTime,
  paymentSchema,
})

registerWhatsAppRoutes({
  app,
  prisma,
  handle,
  authMiddleware,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  appSecret: process.env.WHATSAPP_APP_SECRET,
  logger: console,
})

if (process.env.WHATSAPP_CONFIRMATION_JOB_ENABLED === 'true') {
  const runWhatsAppConfirmationJob = createAppointmentConfirmationJob({ prisma, logger: console })
  const intervalMs = Number(process.env.WHATSAPP_CONFIRMATION_JOB_INTERVAL_MS || 15 * 60 * 1000)
  const interval = setInterval(() => {
    runWhatsAppConfirmationJob().catch(error => {
      console.error('[whatsapp] confirmation job failed', error)
    })
  }, intervalMs)

  interval.unref?.()
}

if (process.env.NODE_ENV !== 'test') {
  startAutomaticBillingJob({ prisma, logger: console })
}
app.get('/clients/:clientId/anamnesis', authMiddleware, handle(async (req, res) => {
  const clientId = parseId(req.params.clientId, 'clientId')
  await prisma.client.findFirstOrThrow({ where: { id: clientId, userId: req.user.id } })

  const list = await prisma.anamnesis.findMany({ where: { clientId }, orderBy: { filledAt: 'desc' } })
  res.json(list)
}))

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

app.get('/clients/:clientId/consent-records', authMiddleware, handle(async (req, res) => {
  const clientId = parseId(req.params.clientId, 'clientId')
  await ensureClientOwnership(req.user.id, clientId)

  const records = await prisma.consentRecord.findMany({
    where: { clientId, userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  })

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
      title: overrides.title || 'Termo de consentimento para procedimentos estÃ©ticos',
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
    throw httpError(409, 'Este termo j foi assinado')
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

app.get('/dashboard', authMiddleware, handle(async (req, res) => {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const nextMonthStart = startOfNextMonth(now)

  const [totalClients, totalAppointments, revenue, upcoming, documents, products, equipmentItems, latestAnamnesis] = await Promise.all([
    prisma.client.count({ where: { userId: req.user.id } }),
    prisma.appointment.count({
      where: { userId: req.user.id, startAt: { gte: monthStart, lt: nextMonthStart }, status: 'COMPLETED' },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: 'PAID',
        appointment: { userId: req.user.id, startAt: { gte: monthStart, lt: nextMonthStart } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        userId: req.user.id,
        startAt: { gte: now },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      include: {
        client: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 5,
    }),
    prisma.clinicDocument.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        category: true,
        documentType: true,
        title: true,
        notes: true,
        expiresAt: true,
        fileName: true,
        fileMimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.productItem.findMany({
      where: { userId: req.user.id, active: true },
    }),
    prisma.equipmentItem.findMany({
      where: { userId: req.user.id, active: true },
    }),
    prisma.anamnesis.findFirst({
      where: { client: { userId: req.user.id } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, answers: true, updatedAt: true },
    }),
  ])

  const documentDashboard = buildDocumentDashboard(documents)
  const inventoryDashboard = buildInventoryDashboard(products, equipmentItems)
  const clinicalInsights = buildClinicalInsights({
    now,
    products,
    equipmentItems,
    anamnesis: latestAnamnesis,
  })

  res.json({
    month: { totalClients, totalAppointments, revenue: revenue._sum.amount ?? 0 },
    upcoming,
    documents: documentDashboard,
    inventory: inventoryDashboard,
    clinicalInsights,
    billing: req.billing,
  })
}))

app.use('/api/v2', createApiV2Router({
  prisma,
  jwtSecret: JWT_SECRET,
  supportAdminEmail: SUPPORT_ADMIN_EMAIL,
  supportAdminPassword: SUPPORT_ADMIN_PASSWORD,
  supportAdminName: SUPPORT_ADMIN_NAME,
  supportContactName: SUPPORT_CONTACT_NAME,
  supportContactEmail: SUPPORT_CONTACT_EMAIL,
  supportContactPhone: SUPPORT_CONTACT_PHONE,
  legacyPdf: {
    sendPdfDocument,
    renderClientMedicalRecordPdf,
    renderServicePopPdf,
    sanitizeFileName,
    ensureServicePopForService,
  },
}))
app.use((error, req, res, next) => {
  if (error?.name === 'ZodError') {
    return res.status(422).json({ error: 'Dados invÃ¡lidos', issues: error.errors })
  }

  if (error?.message === 'Origem nÃ£o permitida pelo CORS') {
    return res.status(403).json({ error: error.message })
  }

  if (error?.code === 'P2002') {
    return res.status(409).json({ error: 'Registro duplicado' })
  }

  if (error?.code === 'P2025') {
    return res.status(404).json({ error: 'NÃ£o encontrado' })
  }

  if (
    error?.name === 'PrismaClientInitializationError' ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return res.status(503).json({ error: 'Banco de dados indisponÃ­vel. Verifique a conexÃ£o e tente novamente.' })
  }

  if (error?.status) {
    return res.status(error.status).json({ error: error.message })
  }

  console.error(error)
  return res.status(500).json({ error: 'Erro interno do servidor' })
})

const PORT = process.env.PORT || 3000

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`L'Appui backend rodando na porta ${port}`)
  })
}

if (require.main === module) {
  startServer()
}

module.exports = {
  app,
  prisma,
  startServer,
}

