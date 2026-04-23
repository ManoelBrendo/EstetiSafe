const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { compactObject, httpError, parseDateOrNull, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { assertAppointmentEditable } = require('../middleware/medical-record-lock')
const {
  appointmentCreateSchema,
  appointmentStatusPatchSchema,
  appointmentUpdateSchema,
  idParamSchema,
  paginationQuerySchema,
} = require('../schemas')

const appointmentsRouter = express.Router()
const appointmentInclude = {
  client: true,
  protocol: {
    include: {
      medicalRecord: true,
    },
  },
}

appointmentsRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { scheduledAt: 'desc' },
      include: appointmentInclude,
    }),
    prisma.appointment.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

appointmentsRouter.post('/', requireAuth, validate({ body: appointmentCreateSchema }), asyncHandler(async (req, res) => {
  const appointment = await prisma.$transaction(async tx => {
    const client = await tx.client.findUnique({ where: { id: req.body.clientId } })
    if (!client) {
      throw httpError(404, 'Cliente nao encontrado para agendamento.')
    }

    if (req.body.protocolId) {
      const protocol = await tx.protocol.findUnique({ where: { id: req.body.protocolId } })
      if (!protocol) {
        throw httpError(404, 'Protocolo informado nao encontrado.')
      }
    }

    const created = await tx.appointment.create({
      data: compactObject({
        clientId: req.body.clientId,
        protocolId: req.body.protocolId ?? null,
        scheduledAt: new Date(req.body.scheduledAt),
        status: req.body.status || 'scheduled',
        hasArrived: req.body.hasArrived ?? false,
        arrivedAt: parseDateOrNull(req.body.arrivedAt),
        notes: req.body.notes ?? null,
      }),
      include: appointmentInclude,
    })

    await recordAudit(tx, {
      entityType: 'Appointment',
      entityId: created.id,
      actionType: 'create',
      userName: req.auth?.email || null,
      newData: created,
    })

    return created
  })

  res.status(201).json(appointment)
}))

appointmentsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: appointmentInclude,
  })

  if (!appointment) {
    throw httpError(404, 'Agendamento nao encontrado.')
  }

  res.json(appointment)
}))

appointmentsRouter.patch('/:id', requireAuth, validate({ params: idParamSchema, body: appointmentUpdateSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await assertAppointmentEditable(tx, req.params.id)

    const next = await tx.appointment.update({
      where: { id: current.id },
      data: compactObject({
        protocolId: req.body.protocolId,
        scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined,
        status: req.body.status,
        hasArrived: req.body.hasArrived,
        arrivedAt: req.body.arrivedAt !== undefined ? parseDateOrNull(req.body.arrivedAt) : undefined,
        notes: req.body.notes,
      }),
      include: appointmentInclude,
    })

    await recordAudit(tx, {
      entityType: 'Appointment',
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

appointmentsRouter.patch('/:id/status', requireAuth, validate({ params: idParamSchema, body: appointmentStatusPatchSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await assertAppointmentEditable(tx, req.params.id)
    const arrived = ['arrived', 'in_service', 'completed'].includes(req.body.status)

    const next = await tx.appointment.update({
      where: { id: current.id },
      data: {
        status: req.body.status,
        hasArrived: arrived,
        arrivedAt: arrived ? current.arrivedAt || new Date() : null,
        notes: req.body.notes ?? current.notes,
      },
      include: appointmentInclude,
    })

    await recordAudit(tx, {
      entityType: 'Appointment',
      entityId: current.id,
      actionType: arrived ? 'check_in' : 'update',
      userName: req.auth?.email || null,
      oldData: current,
      newData: next,
    })

    return next
  })

  res.json(updated)
}))

appointmentsRouter.delete('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  await prisma.$transaction(async tx => {
    const current = await assertAppointmentEditable(tx, req.params.id)
    await tx.appointment.delete({ where: { id: current.id } })
    await recordAudit(tx, {
      entityType: 'Appointment',
      entityId: current.id,
      actionType: 'delete',
      userName: req.auth?.email || null,
      oldData: current,
    })
  })

  res.status(204).send()
}))

module.exports = {
  appointmentsRouter,
}
