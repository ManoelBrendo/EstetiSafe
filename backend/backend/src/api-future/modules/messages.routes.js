const express = require('express')
const { messageCreateSchema } = require('../schemas')
const { asyncHandler, parseUuid } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildWhatsappMessage } = require('../lib/serializers')

function parseOptionalDate(value) {
  if (!value) return undefined

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function createMessagesRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const messages = await context.prisma.whatsappMessage.findMany({
      where: {
        clientId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(messages.map(buildWhatsappMessage))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = messageCreateSchema.parse(req.body)

    const message = await context.prisma.whatsappMessage.create({
      data: {
        clientId: payload.clientId,
        protocolId: payload.protocolId || null,
        clinicPhone: payload.clinicPhone,
        clientPhone: payload.clientPhone,
        messageType: payload.messageType,
        messageBody: payload.messageBody,
        sentAt: parseOptionalDate(payload.sentAt),
        deliveryStatus: payload.deliveryStatus || 'pending',
      },
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'send_whatsapp',
      entityType: 'WhatsappMessage',
      entityId: message.id,
      newData: buildWhatsappMessage(message),
    })

    res.status(201).json(buildWhatsappMessage(message))
  }))

  return router
}

module.exports = {
  createMessagesRouter,
}
