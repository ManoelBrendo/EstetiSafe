const express = require('express')
const { asyncHandler, parsePositiveInt } = require('../lib/http')
const { createAuditLog } = require('../lib/audit')
const { paymentCreateSchema, paymentUpdateSchema } = require('../schemas')
const {
  serializePaymentRecord,
  ensurePaymentOwnership,
  listClientPayments,
  upsertAppointmentPayment,
  updatePayment,
} = require('../lib/payments')

function createPaymentsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    res.json(await listClientPayments(context.prisma, req.currentUser.id, clientId))
  }))

  router.get('/:id', asyncHandler(async (req, res) => {
    const paymentId = parsePositiveInt(req.params.id, 'paymentId')
    const payment = await ensurePaymentOwnership(context.prisma, req.currentUser.id, paymentId)
    res.json(serializePaymentRecord(payment))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = paymentCreateSchema.parse(req.body)
    const payment = await upsertAppointmentPayment(context.prisma, req.currentUser.id, payload)

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_PAYMENT_UPSERT',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        appointmentId: payment.appointmentId,
        clientId: payment.appointment?.client?.id || null,
        path: '/api/v2/payments',
      },
    })

    res.status(201).json(serializePaymentRecord(payment))
  }))

  router.patch('/:id', asyncHandler(async (req, res) => {
    const paymentId = parsePositiveInt(req.params.id, 'paymentId')
    const payload = paymentUpdateSchema.parse(req.body)
    const payment = await updatePayment(context.prisma, req.currentUser.id, paymentId, payload)

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_PAYMENT_UPDATE',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        appointmentId: payment.appointmentId,
        clientId: payment.appointment?.client?.id || null,
        path: `/api/v2/payments/${payment.id}`,
      },
    })

    res.json(serializePaymentRecord(payment))
  }))

  return router
}

module.exports = {
  createPaymentsRouter,
}
