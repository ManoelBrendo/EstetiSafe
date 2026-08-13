const {
  parseId,
  parseDateTime,
  httpError,
  appointmentSchema,
  ensureEditableClientOwnership,
  ensureServiceOwnership,
  ensureProfessionalOwnership,
  assertClientProntuarioEditable,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function shouldSkipAvailabilityCheck(status) {
  return ['CANCELLED', 'NO_SHOW'].includes(status)
}

function buildAppointmentWhere({
  userId,
  query,
  parseId: parseIdFn = parseId,
  parseDateTime: parseDateTimeFn = parseDateTime,
}) {
  const where = { userId }

  if (query.from || query.to) {
    where.startAt = {}
    if (query.from) where.startAt.gte = parseDateTimeFn(query.from, 'from')
    if (query.to) where.startAt.lte = parseDateTimeFn(query.to, 'to')
  }

  if (query.clientId) where.clientId = parseIdFn(query.clientId, 'clientId')
  if (query.professionalId) where.professionalId = parseIdFn(query.professionalId, 'professionalId')
  if (query.status) where.status = query.status

  return where
}

function normalizeAppointmentData(data, parseDateTimeFn = parseDateTime) {
  const normalized = {}

  if ('clientId' in data) normalized.clientId = data.clientId
  if ('serviceId' in data) normalized.serviceId = data.serviceId
  if ('professionalId' in data) normalized.professionalId = data.professionalId
  if ('startAt' in data) normalized.startAt = parseDateTimeFn(data.startAt, 'startAt')
  if ('endAt' in data) normalized.endAt = parseDateTimeFn(data.endAt, 'endAt')
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('price' in data) normalized.price = data.price
  if ('status' in data) normalized.status = data.status

  return normalized
}

async function ensureEditableAppointmentOwnership({ prisma, userId, appointmentId }) {
  const appointment = await prisma.appointment.findFirstOrThrow({
    where: { id: appointmentId, userId },
    include: {
      client: {
        select: { id: true, name: true, isPaid: true, isLocked: true, lockedAt: true },
      },
    },
  })

  assertClientProntuarioEditable(appointment.client)
  return appointment
}

async function ensureAppointmentReferences({
  userId,
  data,
}) {
  await Promise.all([
    ensureEditableClientOwnership(userId, data.clientId),
    ensureServiceOwnership(userId, data.serviceId),
    ensureProfessionalOwnership(userId, data.professionalId),
  ])
}

async function ensureProfessionalAvailability({
  prisma,
  userId,
  professionalId,
  startAt,
  endAt,
  ignoreAppointmentId,
}) {
  const conflict = await prisma.appointment.findFirst({
    where: {
      userId,
      professionalId,
      ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  })

  if (conflict) {
    throw httpError(409, 'Esta profissional ja possui atendimento agendado nesse horario')
  }
}

function validateAppointmentWindow({ appointmentData }) {
  if (appointmentData.endAt <= appointmentData.startAt) {
    throw httpError(422, 'O horario final deve ser maior que o inicial')
  }
}

function registerAppointmentRoutes({
  app,
  prisma,
}) {
  app.get('/appointments', authMiddleware, handle(async (req, res) => {
    const where = buildAppointmentWhere({
      userId: req.user.id,
      query: req.query,
    })

    const list = await prisma.appointment.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, duration: true } },
        professional: { select: { id: true, name: true } },
        payment: true,
      },
      orderBy: { startAt: 'asc' },
    })

    res.json(list)
  }))

  app.get('/appointments/:id', authMiddleware, handle(async (req, res) => {
    const appointmentId = parseId(req.params.id, 'appointmentId')
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { id: appointmentId, userId: req.user.id },
      include: { client: true, service: true, professional: true, payment: true },
    })

    res.json(appointment)
  }))

  app.post('/appointments', authMiddleware, handle(async (req, res) => {
    const data = appointmentSchema.parse(req.body)
    const appointmentData = normalizeAppointmentData(data)

    validateAppointmentWindow({ appointmentData })

    await ensureAppointmentReferences({
      userId: req.user.id,
      data: appointmentData,
    })

    if (!shouldSkipAvailabilityCheck(appointmentData.status)) {
      await ensureProfessionalAvailability({
        prisma,
        userId: req.user.id,
        professionalId: appointmentData.professionalId,
        startAt: appointmentData.startAt,
        endAt: appointmentData.endAt,
      })
    }

    const appointment = await prisma.appointment.create({
      data: {
        userId: req.user.id,
        ...appointmentData,
      },
    })

    res.status(201).json(appointment)
  }))

  app.put('/appointments/:id', authMiddleware, handle(async (req, res) => {
    const appointmentId = parseId(req.params.id, 'appointmentId')
    const data = appointmentSchema.partial().parse(req.body)
    const currentAppointment = await ensureEditableAppointmentOwnership({
      prisma,
      userId: req.user.id,
      appointmentId,
    })
    const updateData = normalizeAppointmentData(data)
    const nextAppointment = { ...currentAppointment, ...updateData }

    validateAppointmentWindow({ appointmentData: nextAppointment })

    await ensureAppointmentReferences({
      userId: req.user.id,
      data: nextAppointment,
    })

    if (!shouldSkipAvailabilityCheck(nextAppointment.status)) {
      await ensureProfessionalAvailability({
        prisma,
        userId: req.user.id,
        professionalId: nextAppointment.professionalId,
        startAt: nextAppointment.startAt,
        endAt: nextAppointment.endAt,
        ignoreAppointmentId: appointmentId,
      })
    }

    const appointment = await prisma.appointment.update({ where: { id: appointmentId }, data: updateData })
    res.json(appointment)
  }))

  app.delete('/appointments/:id', authMiddleware, handle(async (req, res) => {
    const appointmentId = parseId(req.params.id, 'appointmentId')
    await ensureEditableAppointmentOwnership({
      prisma,
      userId: req.user.id,
      appointmentId,
    })
    await prisma.appointment.updateMany({
      where: { id: appointmentId, userId: req.user.id },
      data: { status: 'CANCELLED' },
    })
    res.json({ ok: true })
  }))
}

module.exports = {
  buildAppointmentWhere,
  ensureProfessionalAvailability,
  normalizeAppointmentData,
  registerAppointmentRoutes,
  shouldSkipAvailabilityCheck,
  validateAppointmentWindow,
}
