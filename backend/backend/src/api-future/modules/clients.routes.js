const express = require('express')
const { clientCreateSchema, clientUpdateSchema } = require('../schemas')
const { asyncHandler, parseUuid, pickDefined, httpError } = require('../lib/http')
const { buildClient } = require('../lib/serializers')
const { createFutureAuditLog } = require('../lib/audit')

function parseOptionalDate(value) {
  if (!value) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(422, 'Data invalida')
  }

  return parsed
}

function createClientsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/', asyncHandler(async (req, res) => {
    const clients = await context.prisma.client.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        medicalRecord: true,
      },
    })

    res.json(clients.map(buildClient))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = clientCreateSchema.parse(req.body)

    const client = await context.prisma.$transaction(async tx => {
      const created = await tx.client.create({
        data: pickDefined({
          fullName: payload.fullName,
          cpf: payload.cpf || null,
          birthDate: parseOptionalDate(payload.birthDate),
          phone: payload.phone || null,
          email: payload.email || null,
          emergencyContactName: payload.emergencyContactName || null,
          emergencyContactPhone: payload.emergencyContactPhone || null,
          status: payload.status,
        }),
      })

      await tx.medicalRecord.create({
        data: {
          clientId: created.id,
        },
      })

      return tx.client.findUnique({
        where: {
          id: created.id,
        },
        include: {
          medicalRecord: true,
        },
      })
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'create',
      entityType: 'Client',
      entityId: client.id,
      newData: buildClient(client),
    })

    res.status(201).json(buildClient(client))
  }))

  router.get('/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const client = await context.prisma.client.findUnique({
      where: {
        id: clientId,
      },
      include: {
        medicalRecord: true,
      },
    })

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado')
    }

    res.json(buildClient(client))
  }))

  router.patch('/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const payload = clientUpdateSchema.parse(req.body)

    const existing = await context.prisma.client.findUnique({
      where: {
        id: clientId,
      },
      include: {
        medicalRecord: true,
      },
    })

    if (!existing) {
      throw httpError(404, 'Cliente nao encontrado')
    }

    const client = await context.prisma.client.update({
      where: {
        id: clientId,
      },
      data: pickDefined({
        fullName: payload.fullName,
        cpf: payload.cpf === '' ? null : payload.cpf,
        birthDate: payload.birthDate === '' ? null : parseOptionalDate(payload.birthDate),
        phone: payload.phone === '' ? null : payload.phone,
        email: payload.email === '' ? null : payload.email,
        emergencyContactName: payload.emergencyContactName === '' ? null : payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone === '' ? null : payload.emergencyContactPhone,
        status: payload.status,
      }),
      include: {
        medicalRecord: true,
      },
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'update',
      entityType: 'Client',
      entityId: client.id,
      oldData: buildClient(existing),
      newData: buildClient(client),
    })

    res.json(buildClient(client))
  }))

  return router
}

module.exports = {
  createClientsRouter,
}
