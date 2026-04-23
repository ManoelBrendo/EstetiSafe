const express = require('express')
const { paymentCreateSchema, paymentUpdateSchema } = require('../schemas')
const { asyncHandler, parseUuid, pickDefined, httpError } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildPayment } = require('../lib/serializers')
const { getOrCreateMedicalRecordForClient, lockMedicalRecord } = require('../lib/medical-records')

function parseOptionalDate(value) {
  if (!value) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(422, 'Data invalida')
  }

  return parsed
}

function shouldLockMedicalRecord(paymentStatus) {
  return paymentStatus === 'paid'
}

function createPaymentsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const payments = await context.prisma.payment.findMany({
      where: {
        clientId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(payments.map(buildPayment))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = paymentCreateSchema.parse(req.body)
    const medicalRecord = payload.medicalRecordId
      ? await context.prisma.medicalRecord.findUnique({ where: { id: payload.medicalRecordId } })
      : await getOrCreateMedicalRecordForClient(context.prisma, payload.clientId)

    if (!medicalRecord) {
      throw httpError(404, 'Prontuario nao encontrado para o pagamento')
    }

    const payment = await context.prisma.payment.create({
      data: {
        clientId: payload.clientId,
        medicalRecordId: medicalRecord.id,
        protocolId: payload.protocolId || null,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod || null,
        paymentStatus: payload.paymentStatus || 'pending',
        paidAt: parseOptionalDate(payload.paidAt),
        externalReference: payload.externalReference || null,
      },
    })

    if (shouldLockMedicalRecord(payment.paymentStatus)) {
      await lockMedicalRecord(context.prisma, medicalRecord.id, payment.paidAt || new Date())
    }

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'create',
      entityType: 'Payment',
      entityId: payment.id,
      newData: buildPayment(payment),
    })

    res.status(201).json(buildPayment(payment))
  }))

  router.patch('/:paymentId', asyncHandler(async (req, res) => {
    const paymentId = parseUuid(req.params.paymentId, 'paymentId')
    const payload = paymentUpdateSchema.parse(req.body)

    const existing = await context.prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    })

    if (!existing) {
      throw httpError(404, 'Pagamento nao encontrado')
    }

    const payment = await context.prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: pickDefined({
        amount: payload.amount,
        paymentMethod: payload.paymentMethod === '' ? null : payload.paymentMethod,
        paymentStatus: payload.paymentStatus,
        paidAt: payload.paidAt === '' ? null : parseOptionalDate(payload.paidAt),
        externalReference: payload.externalReference === '' ? null : payload.externalReference,
      }),
    })

    if (shouldLockMedicalRecord(payment.paymentStatus)) {
      await lockMedicalRecord(context.prisma, payment.medicalRecordId, payment.paidAt || new Date())
    }

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'update',
      entityType: 'Payment',
      entityId: payment.id,
      oldData: buildPayment(existing),
      newData: buildPayment(payment),
    })

    res.json(buildPayment(payment))
  }))

  return router
}

module.exports = {
  createPaymentsRouter,
}
