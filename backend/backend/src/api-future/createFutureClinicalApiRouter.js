const express = require('express')
const { createClientsRouter } = require('./modules/clients.routes')
const { createMedicalRecordsRouter } = require('./modules/medical-records.routes')
const { createProtocolsRouter } = require('./modules/protocols.routes')
const { createAppointmentsRouter } = require('./modules/appointments.routes')
const { createPaymentsRouter } = require('./modules/payments.routes')
const { createDocumentsRouter } = require('./modules/documents.routes')
const { createMessagesRouter } = require('./modules/messages.routes')

function passthrough(_req, _res, next) {
  next()
}

function createFutureClinicalApiRouter(config) {
  if (!config?.prisma) {
    throw new Error('createFutureClinicalApiRouter requer uma instancia do Prisma')
  }

  const router = express.Router()
  const context = {
    ...config,
    authMiddleware: config.auth?.authMiddleware || passthrough,
    requireScopedClinicUser: config.auth?.requireScopedClinicUser || passthrough,
  }

  router.get('/', (req, res) => {
    res.json({
      name: "L'Appui Future Clinical API",
      status: 'saved',
      mounted: false,
      purpose: 'future-medical-records-schema',
      modules: ['clients', 'medical-records', 'protocols', 'appointments', 'payments', 'documents', 'messages'],
    })
  })

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      api: 'future',
      timestamp: new Date().toISOString(),
    })
  })

  router.use('/clients', createClientsRouter(context))
  router.use('/medical-records', createMedicalRecordsRouter(context))
  router.use('/protocols', createProtocolsRouter(context))
  router.use('/appointments', createAppointmentsRouter(context))
  router.use('/payments', createPaymentsRouter(context))
  router.use('/documents', createDocumentsRouter(context))
  router.use('/messages', createMessagesRouter(context))

  return router
}

module.exports = {
  createFutureClinicalApiRouter,
}
