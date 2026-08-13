require('./src/config/env')
const express = require('express')
const cors = require('cors')

const prisma = require('./src/legacy/lib/prisma')
const { assertProductionReady, securityHeaders } = require('./lib/production-readiness')
const { createApiV2Router } = require('./src/api-v2/createApiV2Router')

const {
  generalLimiter,
  strictLimiter,
  requireHttps,
  sanitizePayload,
  csrfCheck,
  errorHandler,
} = require('./src/legacy/lib/middlewares')

const {
  SUPPORT_ADMIN_EMAIL,
  SUPPORT_ADMIN_PASSWORD,
  SUPPORT_ADMIN_NAME,
  SUPPORT_CONTACT_NAME,
  SUPPORT_CONTACT_EMAIL,
  SUPPORT_CONTACT_PHONE,
  sendPdfDocument,
  renderClientMedicalRecordPdf,
  renderServicePopPdf,
  sanitizeFileName,
  ensureServicePopForService,
} = require('./src/legacy/lib/helpers')

// Legacy Route Registrars
const { registerSupportRoutes } = require('./src/legacy/support')
const { registerLeadRoutes } = require('./src/legacy/leads')
const { registerAuthRoutes } = require('./src/legacy/auth')
const { registerCorrectiveActionRoutes } = require('./src/legacy/correctiveActions')
const { registerPrivacyRoutes } = require('./src/legacy/privacy')
const { registerBillingRoutes } = require('./src/legacy/billing')
const { registerBillingGatewayRoutes } = require('./src/legacy/billingGateway')
const { registerDocumentRoutes } = require('./src/legacy/documents')
const { registerInventoryRoutes } = require('./src/legacy/inventory')
const { registerLegacyClientRoutes } = require('./src/legacy/clients')
const { registerLegacyProfessionalRoutes } = require('./src/legacy/professionals')
const { registerServiceRoutes } = require('./src/legacy/services')
const { registerIntercurrenceRoutes } = require('./src/legacy/intercurrences')
const { registerAppointmentRoutes } = require('./src/legacy/appointments')
const { registerPaymentRoutes } = require('./src/legacy/payments')
const { registerWhatsAppRoutes, createAppointmentConfirmationJob } = require('./src/legacy/whatsapp')
const { registerLegacyAnamnesisRoutes } = require('./src/legacy/anamnesis')
const { registerLegacyConsentRoutes } = require('./src/legacy/consent')
const { registerLegacyDashboardRoutes } = require('./src/legacy/dashboard')
const { registerAuditReportRoutes } = require('./src/legacy/auditReport')

const { startAutomaticBillingJob } = require('./src/legacy/billingAutomation')

const cookieParser = require('cookie-parser')

const app = express()
app.disable('x-powered-by')
app.use(cookieParser())

// Global Middlewares & Rate Limiters
app.use(generalLimiter)
app.use('/auth/login', strictLimiter)
app.use('/auth/register', strictLimiter)
app.use('/webhooks/whatsapp', strictLimiter)
app.use('/webhooks/billing', strictLimiter)

app.use(requireHttps)
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

    return callback(new Error('Origem não permitida pelo CORS'))
  },
  credentials: true,
  maxAge: 7200,
}))

app.use(express.json({
  limit: '8mb',
  verify(req, _res, buf) {
    if (req.originalUrl?.startsWith('/webhooks/whatsapp') || req.originalUrl?.startsWith('/webhooks/billing')) {
      req.rawBody = Buffer.from(buf)
    }
  },
}))

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Payload JSON malformado' })
  }
  next()
})

app.use(sanitizePayload)
app.use(csrfCheck)

// Health & Readiness checks
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ ok: true, database: 'reachable', ts: new Date().toISOString() })
  } catch {
    return res.status(503).json({ ok: false, database: 'unreachable', ts: new Date().toISOString() })
  }
})

// Legacy Route Initializations
registerSupportRoutes({ app, prisma })
registerLeadRoutes({ app, prisma })
registerAuthRoutes({ app, prisma })
registerCorrectiveActionRoutes({ app, prisma })
registerPrivacyRoutes({ app, prisma })
registerBillingRoutes({ app, prisma })
registerBillingGatewayRoutes({ app, prisma })
registerDocumentRoutes({ app, prisma })
registerInventoryRoutes({ app, prisma })
registerLegacyClientRoutes({ app, prisma })
registerLegacyProfessionalRoutes({ app, prisma })
registerServiceRoutes({ app, prisma })
registerIntercurrenceRoutes({ app, prisma })
registerAppointmentRoutes({ app, prisma })
registerPaymentRoutes({ app, prisma })
registerWhatsAppRoutes({ app, prisma })
registerLegacyAnamnesisRoutes({ app, prisma })
registerLegacyConsentRoutes({ app, prisma })
registerLegacyDashboardRoutes({ app, prisma })
registerAuditReportRoutes({ app, prisma })

// Background Jobs
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

// API V2 Routes
app.use('/api/v2', createApiV2Router({
  prisma,
  jwtSecret: process.env.JWT_SECRET,
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

// Global Error Handler
app.use(errorHandler)

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
