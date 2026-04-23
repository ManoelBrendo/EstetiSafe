const express = require('express')
const { appointmentCreateSchema, appointmentStatusUpdateSchema } = require('../schemas')
const { asyncHandler, parseUuid, pickDefined, httpError } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildAppointment } = require('../lib/serializers')

function parseOptionalDate(value) {
  if (!value) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(422, 'Data invalida')
  }

  return parsed
}

function createAppointmentsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/', asyncHandler(async (req, res) => {
    const where = pickDefined({
      clientId: req.query.clientId ? parseUuid(String(req.query.clientId), 'clientId') : undefined,
      protocolId: req.query.protocolId ? parseUuid(String(req.query.protocolId), 'protocolId') : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
    })

    const appointments = await context.prisma.appointment.findMany({
      where,
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    res.json(appointments.map(buildAppointment))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = appointmentCreateSchema.parse(req.body)

    const appointment = await context.prisma.appointment.create({
      data: {
        clientId: payload.clientId,
        protocolId: payload.protocolId || null,
        scheduledAt: new Date(payload.scheduledAt),
        status: payload.status || 'scheduled',
        hasArrived: payload.hasArrived || false,
        arrivedAt: parseOptionalDate(payload.arrivedAt),
        notes: payload.notes || null,
      },
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'create',
      entityType: 'Appointment',
      entityId: appointment.id,
      newData: buildAppointment(appointment),
    })

    res.status(201).json(buildAppointment(appointment))
  }))

  router.patch('/:appointmentId/status', asyncHandler(async (req, res) => {
    const appointmentId = parseUuid(req.params.appointmentId, 'appointmentId')
    const payload = appointmentStatusUpdateSchema.parse(req.body)

    const existing = await context.prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
    })

    if (!existing) {
      throw httpError(404, 'Agendamento nao encontrado')
    }

    const appointment = await context.prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: pickDefined({
        status: payload.status,
        hasArrived: payload.hasArrived,
        arrivedAt: payload.arrivedAt === '' ? null : parseOptionalDate(payload.arrivedAt),
        notes: payload.notes === '' ? null : payload.notes,
      }),
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: payload.status === 'arrived' ? 'check_in' : 'update',
      entityType: 'Appointment',
      entityId: appointment.id,
      oldData: buildAppointment(existing),
      newData: buildAppointment(appointment),
    })

    res.json(buildAppointment(appointment))
  }))

  return router
}

module.exports = {
  createAppointmentsRouter,
}
