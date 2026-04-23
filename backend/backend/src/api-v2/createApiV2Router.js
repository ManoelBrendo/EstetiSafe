const express = require('express')
const { createAuthToolkit } = require('./lib/auth')
const { createAuthRouter } = require('./modules/auth.routes')
const { createClientsRouter } = require('./modules/clients.routes')
const { createMedicalRecordsRouter } = require('./modules/medical-records.routes')
const { createProtocolsRouter } = require('./modules/protocols.routes')
const { createPaymentsRouter } = require('./modules/payments.routes')
const { createPdfRouter } = require('./modules/pdf.routes')

function createApiV2Router(config) {
  const router = express.Router()
  const auth = createAuthToolkit(config)
  const context = {
    ...config,
    auth,
  }

  router.get('/', (req, res) => {
    res.json({
      name: "L'Appui API v2",
      status: 'ready',
      mode: 'legacy-schema-compat',
      modules: ['auth', 'clients', 'medical-records', 'anamnesis', 'protocols', 'payments', 'pdf'],
    })
  })

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      api: 'v2',
      schemaMode: 'legacy-compat',
      timestamp: new Date().toISOString(),
    })
  })

  router.use('/auth', createAuthRouter(context))
  router.use('/clients', createClientsRouter(context))
  router.use('/medical-records', createMedicalRecordsRouter(context))
  router.use('/protocols', createProtocolsRouter(context))
  router.use('/payments', createPaymentsRouter(context))
  router.use('/pdf', createPdfRouter(context))

  return router
}

module.exports = {
  createApiV2Router,
}
