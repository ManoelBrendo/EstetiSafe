const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { compactObject, httpError, parseDateOrNull, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth, requireRole } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { idParamSchema, paginationQuerySchema, paymentConfirmSchema, paymentCreateSchema, paymentUpdateSchema } = require('../schemas')
const { lockMedicalRecord } = require('../middleware/medical-record-lock')

const paymentsRouter = express.Router()
const paymentInclude = {
  client: true,
  medicalRecord: true,
  protocol: true,
}

function isSupportLikeRole(auth) {
  return ['support', 'admin'].includes(auth?.role)
}

function assertProtectedPaymentMutation(auth, current, payload) {
  const touchesProtectedFields = payload.amount !== undefined
    || payload.paymentStatus !== undefined
    || payload.paidAt !== undefined
    || payload.paymentMethod !== undefined
    || payload.externalReference !== undefined

  if (!touchesProtectedFields) return

  if (!isSupportLikeRole(auth)) {
    throw httpError(403, 'Somente suporte ou administracao podem confirmar pagamento ou alterar dados financeiros protegidos.')
  }

  if (current?.paymentStatus === 'paid' && payload.paymentStatus && payload.paymentStatus !== 'paid' && !isSupportLikeRole(auth)) {
    throw httpError(409, 'Pagamento confirmado nao pode voltar para outro status por esta rota.')
  }
}

async function finalizePaymentIfPaid(tx, payment, userName) {
  if (payment.paymentStatus !== 'paid') return

  const lockedAt = payment.paidAt || new Date()
  await lockMedicalRecord(tx, payment.medicalRecordId, lockedAt)
  await recordAudit(tx, {
    entityType: 'MedicalRecord',
    entityId: payment.medicalRecordId,
    actionType: 'lock',
    userName,
    newData: { isPaid: true, isLocked: true, lockedAt },
  })
}

async function resolveMedicalRecordId(tx, payload) {
  if (payload.medicalRecordId) return payload.medicalRecordId

  const client = await tx.client.findUnique({
    where: { id: payload.clientId },
    include: { medicalRecord: true },
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado para registrar pagamento.')
  }

  if (!client.medicalRecord?.id) {
    throw httpError(400, 'O cliente ainda nao possui prontuario associado.')
  }

  return client.medicalRecord.id
}

paymentsRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    }),
    prisma.payment.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

paymentsRouter.post('/', requireAuth, validate({ body: paymentCreateSchema }), asyncHandler(async (req, res) => {
  if (req.body.paymentStatus === 'paid' && !isSupportLikeRole(req.auth)) {
    throw httpError(403, 'A confirmacao imediata do pagamento fica reservada para suporte ou administracao.')
  }

  const payment = await prisma.$transaction(async tx => {
    const medicalRecordId = await resolveMedicalRecordId(tx, req.body)

    const created = await tx.payment.create({
      data: compactObject({
        clientId: req.body.clientId,
        medicalRecordId,
        protocolId: req.body.protocolId ?? null,
        amount: req.body.amount,
        paymentMethod: req.body.paymentMethod ?? null,
        paymentStatus: req.body.paymentStatus || 'pending',
        paidAt: parseDateOrNull(req.body.paidAt),
        externalReference: req.body.externalReference ?? null,
      }),
      include: paymentInclude,
    })

    await finalizePaymentIfPaid(tx, created, req.auth?.email || null)

    await recordAudit(tx, {
      entityType: 'Payment',
      entityId: created.id,
      actionType: 'create',
      userName: req.auth?.email || null,
      newData: created,
    })

    return tx.payment.findUnique({
      where: { id: created.id },
      include: paymentInclude,
    })
  })

  res.status(201).json(payment)
}))

paymentsRouter.post('/:id/confirm', requireAuth, requireRole('support', 'admin'), validate({ params: idParamSchema, body: paymentConfirmSchema }), asyncHandler(async (req, res) => {
  const payment = await prisma.$transaction(async tx => {
    const current = await tx.payment.findUnique({
      where: { id: req.params.id },
      include: paymentInclude,
    })

    if (!current) {
      throw httpError(404, 'Pagamento nao encontrado.')
    }

    const next = await tx.payment.update({
      where: { id: current.id },
      data: {
        paymentStatus: 'paid',
        paidAt: req.body.paidAt ? new Date(req.body.paidAt) : current.paidAt || new Date(),
        paymentMethod: req.body.paymentMethod ?? current.paymentMethod,
        externalReference: req.body.externalReference ?? current.externalReference,
      },
      include: paymentInclude,
    })

    await finalizePaymentIfPaid(tx, next, req.auth?.email || null)

    await recordAudit(tx, {
      entityType: 'Payment',
      entityId: current.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(payment)
}))

paymentsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: paymentInclude,
  })

  if (!payment) {
    throw httpError(404, 'Pagamento nao encontrado.')
  }

  res.json(payment)
}))

paymentsRouter.patch('/:id', requireAuth, validate({ params: idParamSchema, body: paymentUpdateSchema }), asyncHandler(async (req, res) => {
  const payment = await prisma.$transaction(async tx => {
    const current = await tx.payment.findUnique({
      where: { id: req.params.id },
      include: paymentInclude,
    })

    if (!current) {
      throw httpError(404, 'Pagamento nao encontrado.')
    }

    assertProtectedPaymentMutation(req.auth, current, req.body)

    const next = await tx.payment.update({
      where: { id: current.id },
      data: compactObject({
        protocolId: req.body.protocolId,
        amount: req.body.amount,
        paymentMethod: req.body.paymentMethod,
        paymentStatus: req.body.paymentStatus,
        paidAt: req.body.paidAt !== undefined ? parseDateOrNull(req.body.paidAt) : undefined,
        externalReference: req.body.externalReference,
      }),
      include: paymentInclude,
    })

    if (next.paymentStatus === 'paid' && !current.medicalRecord?.isLocked) {
      await finalizePaymentIfPaid(tx, next, req.auth?.email || null)
    }

    await recordAudit(tx, {
      entityType: 'Payment',
      entityId: current.id,
      actionType: 'update',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(payment)
}))

module.exports = {
  paymentsRouter,
}
