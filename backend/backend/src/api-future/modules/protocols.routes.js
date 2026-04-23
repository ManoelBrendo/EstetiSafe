const crypto = require('crypto')
const express = require('express')
const { protocolCreateSchema, protocolUpdateSchema } = require('../schemas')
const { asyncHandler, parseUuid, pickDefined, httpError } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildProtocol } = require('../lib/serializers')
const { getOrCreateMedicalRecordForClient, assertMedicalRecordEditable } = require('../lib/medical-records')

const protocolInclude = {
  services: {
    include: {
      service: true,
    },
  },
}

function buildProtocolNumber() {
  return `PT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
}

async function replaceProtocolServices(tx, protocolId, services = []) {
  await tx.protocolService.deleteMany({
    where: {
      protocolId,
    },
  })

  if (!services.length) return

  await tx.protocolService.createMany({
    data: services.map((service, index) => ({
      protocolId,
      serviceId: service.serviceId,
      customServiceName: service.customServiceName || null,
      sessions: service.sessions,
      description: service.description || null,
      adverseEffects: service.adverseEffects || '',
      sortOrder: service.sortOrder ?? index,
    })),
  })
}

function createProtocolsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const protocols = await context.prisma.protocol.findMany({
      where: {
        clientId,
      },
      include: protocolInclude,
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(protocols.map(buildProtocol))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = protocolCreateSchema.parse(req.body)
    const medicalRecord = await getOrCreateMedicalRecordForClient(context.prisma, payload.clientId)
    assertMedicalRecordEditable(medicalRecord)

    const protocol = await context.prisma.$transaction(async tx => {
      const created = await tx.protocol.create({
        data: {
          medicalRecordId: medicalRecord.id,
          clientId: payload.clientId,
          protocolNumber: buildProtocolNumber(),
          protocolName: payload.protocolName,
          recommendations: payload.recommendations || null,
          guidelines: payload.guidelines || null,
          notes: payload.notes || null,
          treatmentObjective: payload.treatmentObjective || null,
          status: payload.status || 'draft',
        },
      })

      await replaceProtocolServices(tx, created.id, payload.services || [])

      return tx.protocol.findUnique({
        where: {
          id: created.id,
        },
        include: protocolInclude,
      })
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'create',
      entityType: 'Protocol',
      entityId: protocol.id,
      newData: buildProtocol(protocol),
    })

    res.status(201).json(buildProtocol(protocol))
  }))

  router.patch('/:protocolId', asyncHandler(async (req, res) => {
    const protocolId = parseUuid(req.params.protocolId, 'protocolId')
    const payload = protocolUpdateSchema.parse(req.body)

    const existing = await context.prisma.protocol.findUnique({
      where: {
        id: protocolId,
      },
      include: {
        ...protocolInclude,
        medicalRecord: true,
      },
    })

    if (!existing) {
      throw httpError(404, 'Protocolo nao encontrado')
    }

    assertMedicalRecordEditable(existing.medicalRecord)

    const protocol = await context.prisma.$transaction(async tx => {
      await tx.protocol.update({
        where: {
          id: protocolId,
        },
        data: pickDefined({
          protocolName: payload.protocolName,
          recommendations: payload.recommendations === '' ? null : payload.recommendations,
          guidelines: payload.guidelines === '' ? null : payload.guidelines,
          notes: payload.notes === '' ? null : payload.notes,
          treatmentObjective: payload.treatmentObjective === '' ? null : payload.treatmentObjective,
          status: payload.status,
        }),
      })

      if (payload.services) {
        await replaceProtocolServices(tx, protocolId, payload.services)
      }

      return tx.protocol.findUnique({
        where: {
          id: protocolId,
        },
        include: protocolInclude,
      })
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'update',
      entityType: 'Protocol',
      entityId: protocol.id,
      oldData: buildProtocol(existing),
      newData: buildProtocol(protocol),
    })

    res.json(buildProtocol(protocol))
  }))

  return router
}

module.exports = {
  createProtocolsRouter,
}
