const express = require('express')
const { asyncHandler, parsePositiveInt, httpError } = require('../lib/http')
const { createAuditLog } = require('../lib/audit')
const { protocolUpsertSchema } = require('../schemas')
const {
  summarizeServicePop,
  serializeServiceCatalogItem,
  ensureServiceOwnership,
  buildProtocolBundle,
  upsertProtocolForClient,
} = require('../lib/protocols')
const { ensureClientOwnership } = require('../lib/medical-records')

function createProtocolsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/service-catalog', asyncHandler(async (req, res) => {
    const services = await context.prisma.service.findMany({
      where: { userId: req.currentUser.id },
      include: { servicePop: true },
      orderBy: { name: 'asc' },
    })

    res.json({
      items: services.map(serializeServiceCatalogItem),
      total: services.length,
    })
  }))

  router.get('/service-catalog/:serviceId/pop', asyncHandler(async (req, res) => {
    const serviceId = parsePositiveInt(req.params.serviceId, 'serviceId')
    const service = await ensureServiceOwnership(context.prisma, req.currentUser.id, serviceId)

    let pop = service.servicePop

    if (!pop && context.legacyPdf?.ensureServicePopForService) {
      pop = await context.legacyPdf.ensureServicePopForService({
        userId: req.currentUser.id,
        clinicName: req.currentUser.clinicName,
        service,
      })
    }

    if (!pop) {
      throw httpError(404, 'POP ainda não disponível para este serviço.')
    }

    res.json({
      service: serializeServiceCatalogItem({ ...service, servicePop: pop }),
      pop: {
        id: pop.id,
        title: pop.title,
        content: pop.content,
        createdAt: pop.createdAt,
        updatedAt: pop.updatedAt,
        summary: summarizeServicePop(pop, service.id),
      },
    })
  }))

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json(buildProtocolBundle(client))
  }))

  router.get('/by-client/:clientId/current', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    const bundle = buildProtocolBundle(client)

    res.json({
      medicalRecordId: bundle.medicalRecordId,
      client: bundle.client,
      current: bundle.current,
      accessState: bundle.accessState,
      availableActions: bundle.availableActions,
    })
  }))

  router.put('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const payload = protocolUpsertSchema.parse(req.body)
    const updatedClient = await upsertProtocolForClient(context.prisma, req.currentUser.id, clientId, payload)
    const bundle = buildProtocolBundle(updatedClient)

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_PROTOCOL_UPSERT',
      entityType: 'Protocol',
      entityId: bundle.current?.id || null,
      metadata: {
        clientId: updatedClient.id,
        medicalRecordId: bundle.medicalRecordId,
        path: `/api/v2/protocols/by-client/${updatedClient.id}`,
      },
    })

    res.json(bundle)
  }))

  return router
}

module.exports = {
  createProtocolsRouter,
}
