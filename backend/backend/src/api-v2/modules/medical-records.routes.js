const express = require('express')
const { asyncHandler } = require('../lib/http')

function createMedicalRecordsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  let medicalRecordsController
  if (context.container) {
    medicalRecordsController = context.container.resolve('medicalRecordsController')
  } else {
    const { Container } = require('../lib/container')
    const { AuditService } = require('../lib/audit.service')
    const { MedicalRecordsRepository } = require('./medical-records/medical-records.repository')
    const { MedicalRecordsService } = require('./medical-records/medical-records.service')
    const { MedicalRecordsController } = require('./medical-records/medical-records.controller')

    const container = new Container()
    container.registerInstance('prisma', context.prisma)
    container.registerInstance('auth', context.auth)

    container.registerFactory('auditService', (c) => new AuditService(c.resolve('prisma'), c.resolve('auth')))
    container.registerFactory('medicalRecordsRepository', (c) => new MedicalRecordsRepository(c.resolve('prisma')))
    container.registerFactory('medicalRecordsService', (c) => new MedicalRecordsService(c.resolve('medicalRecordsRepository'), c.resolve('auditService')))
    container.registerFactory('medicalRecordsController', (c) => new MedicalRecordsController(c.resolve('medicalRecordsService')))

    medicalRecordsController = container.resolve('medicalRecordsController')
  }

  router.get('/by-client/:clientId', asyncHandler((req, res) => medicalRecordsController.getRecord(req, res)))
  router.get('/by-client/:clientId/summary', asyncHandler((req, res) => medicalRecordsController.getSummary(req, res)))
  router.get('/by-client/:clientId/access-state', asyncHandler((req, res) => medicalRecordsController.getAccessState(req, res)))
  router.get('/by-client/:clientId/anamnesis', asyncHandler((req, res) => medicalRecordsController.getAnamnesis(req, res)))
  router.put('/by-client/:clientId/anamnesis', asyncHandler((req, res) => medicalRecordsController.putAnamnesis(req, res)))

  return router
}

module.exports = {
  createMedicalRecordsRouter,
}

