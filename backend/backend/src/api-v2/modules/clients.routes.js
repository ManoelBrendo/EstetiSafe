const express = require('express')
const { asyncHandler } = require('../lib/http')

function createClientsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  let clientsController
  if (context.container) {
    clientsController = context.container.resolve('clientsController')
  } else {
    const { Container } = require('../lib/container')
    const { AuditService } = require('../lib/audit.service')
    const { ClientsRepository } = require('./clients/clients.repository')
    const { ClientsService } = require('./clients/clients.service')
    const { ClientsController } = require('./clients/clients.controller')

    const container = new Container()
    container.registerInstance('prisma', context.prisma)
    container.registerInstance('auth', context.auth)

    container.registerFactory('auditService', (c) => new AuditService(c.resolve('prisma'), c.resolve('auth')))
    container.registerFactory('clientsRepository', (c) => new ClientsRepository(c.resolve('prisma')))
    container.registerFactory('clientsService', (c) => new ClientsService(c.resolve('clientsRepository'), c.resolve('auditService')))
    container.registerFactory('clientsController', (c) => new ClientsController(c.resolve('clientsService')))

    clientsController = container.resolve('clientsController')
  }

  router.get('/', asyncHandler((req, res) => clientsController.list(req, res)))

  router.post('/', asyncHandler((req, res) => clientsController.create(req, res)))
  router.get('/:id', asyncHandler((req, res) => clientsController.get(req, res)))
  router.patch('/:id', asyncHandler((req, res) => clientsController.update(req, res)))
  router.get('/:id/overview', asyncHandler((req, res) => clientsController.overview(req, res)))
  router.get('/:id/timeline', asyncHandler((req, res) => clientsController.timeline(req, res)))
  router.get('/:id/medical-record', asyncHandler((req, res) => clientsController.medicalRecord(req, res)))
  router.get('/:id/facial-points', asyncHandler((req, res) => clientsController.getFacialPoints(req, res)))
  router.put('/:id/facial-points', asyncHandler((req, res) => clientsController.updateFacialPoints(req, res)))
  router.post('/:id/reveal', asyncHandler((req, res) => clientsController.reveal(req, res)))

  return router
}

module.exports = {
  createClientsRouter,
}

