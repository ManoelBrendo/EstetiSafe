const { healthRouter } = require('./health.routes')
const { authRouter } = require('./auth.routes')
const { clientsRouter } = require('./clients.routes')
const { medicalRecordsRouter } = require('./medical-records.routes')
const { servicesRouter } = require('./services.routes')
const { protocolsRouter } = require('./protocols.routes')
const { appointmentsRouter } = require('./appointments.routes')
const { paymentsRouter } = require('./payments.routes')
const { documentsRouter } = require('./documents.routes')
const { whatsappRouter } = require('./whatsapp.routes')
const { auditRouter } = require('./audit.routes')

function registerRoutes(app) {
  app.use('/health', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/clients', clientsRouter)
  app.use('/api/medical-records', medicalRecordsRouter)
  app.use('/api/services', servicesRouter)
  app.use('/api/protocols', protocolsRouter)
  app.use('/api/appointments', appointmentsRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/documents', documentsRouter)
  app.use('/api/whatsapp-messages', whatsappRouter)
  app.use('/api/audit-logs', auditRouter)
}

module.exports = {
  registerRoutes,
}
