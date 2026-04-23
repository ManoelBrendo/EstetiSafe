const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { httpError, parseDateOrNull, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { idParamSchema, paginationQuerySchema, whatsappDeliveryPatchSchema, whatsappMessageCreateSchema } = require('../schemas')

const whatsappRouter = express.Router()
const messageInclude = {
  client: true,
  protocol: true,
}

whatsappRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.whatsappMessage.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
      include: messageInclude,
    }),
    prisma.whatsappMessage.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

whatsappRouter.post('/', requireAuth, validate({ body: whatsappMessageCreateSchema }), asyncHandler(async (req, res) => {
  const message = await prisma.$transaction(async tx => {
    const created = await tx.whatsappMessage.create({
      data: {
        clientId: req.body.clientId,
        protocolId: req.body.protocolId ?? null,
        clinicPhone: req.body.clinicPhone,
        clientPhone: req.body.clientPhone,
        messageType: req.body.messageType,
        messageBody: req.body.messageBody,
        deliveryStatus: req.body.deliveryStatus || 'pending',
        sentAt: parseDateOrNull(req.body.sentAt),
      },
      include: messageInclude,
    })

    await recordAudit(tx, {
      entityType: 'WhatsappMessage',
      entityId: created.id,
      actionType: 'send_whatsapp',
      userName: req.auth?.email || null,
      newData: created,
    })

    return created
  })

  res.status(201).json(message)
}))

whatsappRouter.patch('/:id/delivery', requireAuth, validate({ params: idParamSchema, body: whatsappDeliveryPatchSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.whatsappMessage.findUnique({
      where: { id: req.params.id },
      include: messageInclude,
    })

    if (!current) {
      throw httpError(404, 'Mensagem nao encontrada.')
    }

    const next = await tx.whatsappMessage.update({
      where: { id: current.id },
      data: {
        deliveryStatus: req.body.deliveryStatus,
        sentAt: req.body.sentAt !== undefined ? parseDateOrNull(req.body.sentAt) : current.sentAt,
      },
      include: messageInclude,
    })

    await recordAudit(tx, {
      entityType: 'WhatsappMessage',
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

module.exports = {
  whatsappRouter,
}
