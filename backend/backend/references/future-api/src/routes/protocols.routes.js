const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { compactObject, httpError, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { assertProtocolEditable } = require('../middleware/medical-record-lock')
const {
  idParamSchema,
  paginationQuerySchema,
  protocolCreateSchema,
  protocolServicesReplaceSchema,
  protocolStatusPatchSchema,
  protocolUpdateSchema,
} = require('../schemas')

const protocolsRouter = express.Router()
const protocolInclude = {
  client: true,
  medicalRecord: true,
  services: {
    include: { service: true },
    orderBy: { sortOrder: 'asc' },
  },
  appointments: true,
  payments: true,
  pdfDocuments: true,
  whatsappMessages: true,
}

protocolsRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.protocol.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        medicalRecord: true,
      },
    }),
    prisma.protocol.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

protocolsRouter.post('/', requireAuth, validate({ body: protocolCreateSchema }), asyncHandler(async (req, res) => {
  const created = await prisma.$transaction(async tx => {
    const client = await tx.client.findUnique({
      where: { id: req.body.clientId },
      include: { medicalRecord: true },
    })

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado para criar o protocolo.')
    }

    const medicalRecordId = req.body.medicalRecordId || client.medicalRecord?.id
    if (!medicalRecordId) {
      throw httpError(400, 'O cliente precisa ter prontuario antes da criacao do protocolo.')
    }

    const protocol = await tx.protocol.create({
      data: {
        medicalRecordId,
        clientId: req.body.clientId,
        protocolNumber: req.body.protocolNumber,
        protocolName: req.body.protocolName,
        recommendations: req.body.recommendations ?? null,
        guidelines: req.body.guidelines ?? null,
        notes: req.body.notes ?? null,
        treatmentObjective: req.body.treatmentObjective ?? null,
        status: req.body.status || 'draft',
        services: req.body.services.length ? {
          create: req.body.services.map((item, index) => ({
            serviceId: item.serviceId,
            customServiceName: item.customServiceName ?? null,
            sessions: item.sessions,
            description: item.description ?? null,
            adverseEffects: item.adverseEffects,
            sortOrder: item.sortOrder ?? index,
          })),
        } : undefined,
      },
      include: protocolInclude,
    })

    await recordAudit(tx, {
      entityType: 'Protocol',
      entityId: protocol.id,
      actionType: 'create',
      userName: req.auth?.email || null,
      newData: protocol,
    })

    return protocol
  })

  res.status(201).json(created)
}))

protocolsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const protocol = await prisma.protocol.findUnique({
    where: { id: req.params.id },
    include: protocolInclude,
  })

  if (!protocol) {
    throw httpError(404, 'Protocolo nao encontrado.')
  }

  res.json(protocol)
}))

protocolsRouter.patch('/:id', requireAuth, validate({ params: idParamSchema, body: protocolUpdateSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await assertProtocolEditable(tx, req.params.id)

    const next = await tx.protocol.update({
      where: { id: current.id },
      data: compactObject({
        protocolNumber: req.body.protocolNumber,
        protocolName: req.body.protocolName,
        recommendations: req.body.recommendations,
        guidelines: req.body.guidelines,
        notes: req.body.notes,
        treatmentObjective: req.body.treatmentObjective,
        status: req.body.status,
      }),
      include: protocolInclude,
    })

    await recordAudit(tx, {
      entityType: 'Protocol',
      entityId: current.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

protocolsRouter.put('/:id/services', requireAuth, validate({ params: idParamSchema, body: protocolServicesReplaceSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await assertProtocolEditable(tx, req.params.id)

    await tx.protocolService.deleteMany({
      where: { protocolId: current.id },
    })

    if (req.body.services.length) {
      await tx.protocolService.createMany({
        data: req.body.services.map((item, index) => ({
          protocolId: current.id,
          serviceId: item.serviceId,
          customServiceName: item.customServiceName ?? null,
          sessions: item.sessions,
          description: item.description ?? null,
          adverseEffects: item.adverseEffects,
          sortOrder: item.sortOrder ?? index,
        })),
      })
    }

    const next = await tx.protocol.findUnique({
      where: { id: current.id },
      include: protocolInclude,
    })

    await recordAudit(tx, {
      entityType: 'Protocol',
      entityId: current.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

protocolsRouter.patch('/:id/status', requireAuth, validate({ params: idParamSchema, body: protocolStatusPatchSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.protocol.findUnique({ where: { id: req.params.id } })
    if (!current) {
      throw httpError(404, 'Protocolo nao encontrado.')
    }

    const next = await tx.protocol.update({
      where: { id: current.id },
      data: { status: req.body.status },
      include: protocolInclude,
    })

    await recordAudit(tx, {
      entityType: 'Protocol',
      entityId: current.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

protocolsRouter.delete('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  await prisma.$transaction(async tx => {
    const current = await assertProtocolEditable(tx, req.params.id)
    await tx.protocol.delete({ where: { id: current.id } })
    await recordAudit(tx, {
      entityType: 'Protocol',
      entityId: current.id,
      actionType: 'delete',
      userName: req.auth?.email || null,
      oldData: current,
    })
  })

  res.status(204).send()
}))

module.exports = {
  protocolsRouter,
}
