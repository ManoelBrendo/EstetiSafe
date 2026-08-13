const express = require('express')
const { createAuthToolkit } = require('./lib/auth')
const { createAuthRouter } = require('./modules/auth.routes')
const { createClientsRouter } = require('./modules/clients.routes')
const { createMedicalRecordsRouter } = require('./modules/medical-records.routes')
const { createProtocolsRouter } = require('./modules/protocols.routes')
const { createPaymentsRouter } = require('./modules/payments.routes')
const { createPdfRouter } = require('./modules/pdf.routes')
const { createAuditLogsRouter } = require('./modules/audit-logs.routes')

const { Container } = require('./lib/container')
const { AuditService } = require('./lib/audit.service')
const { ClientsRepository } = require('./modules/clients/clients.repository')
const { ClientsService } = require('./modules/clients/clients.service')
const { ClientsController } = require('./modules/clients/clients.controller')
const { MedicalRecordsRepository } = require('./modules/medical-records/medical-records.repository')
const { MedicalRecordsService } = require('./modules/medical-records/medical-records.service')
const { MedicalRecordsController } = require('./modules/medical-records/medical-records.controller')

function createApiV2Router(config) {
  const router = express.Router()
  const container = new Container()
  const auth = createAuthToolkit(config)

  container.registerInstance('prisma', config.prisma)
  container.registerInstance('auth', auth)

  container.registerFactory('auditService', (c) => new AuditService(c.resolve('prisma'), c.resolve('auth')))
  container.registerFactory('clientsRepository', (c) => new ClientsRepository(c.resolve('prisma')))
  container.registerFactory('clientsService', (c) => new ClientsService(c.resolve('clientsRepository'), c.resolve('auditService')))
  container.registerFactory('clientsController', (c) => new ClientsController(c.resolve('clientsService')))
  container.registerFactory('medicalRecordsRepository', (c) => new MedicalRecordsRepository(c.resolve('prisma')))
  container.registerFactory('medicalRecordsService', (c) => new MedicalRecordsService(c.resolve('medicalRecordsRepository'), c.resolve('auditService')))
  container.registerFactory('medicalRecordsController', (c) => new MedicalRecordsController(c.resolve('medicalRecordsService')))


  const context = {
    ...config,
    auth,
    container,
  }


  router.get('/', (req, res) => {
    res.json({
      name: "L'Appui API v2",
      status: 'ready',
      mode: 'legacy-schema-compat',
      modules: ['auth', 'clients', 'medical-records', 'anamnesis', 'protocols', 'payments', 'pdf', 'audit-logs'],
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
  router.use('/audit-logs', createAuditLogsRouter(context))

  return router
}

module.exports = {
  createApiV2Router,
}

