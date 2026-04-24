function shouldSkipAvailabilityCheck(status) {
  return ['CANCELLED', 'NO_SHOW'].includes(status)
}

function buildAppointmentWhere({ userId, query, parseId, parseDateTime }) {
  const where = { userId }

  if (query.from || query.to) {
    where.startAt = {}
    if (query.from) where.startAt.gte = parseDateTime(query.from, 'from')
    if (query.to) where.startAt.lte = parseDateTime(query.to, 'to')
  }

  if (query.clientId) where.clientId = parseId(query.clientId, 'clientId')
  if (query.professionalId) where.professionalId = parseId(query.professionalId, 'professionalId')
  if (query.status) where.status = query.status

  return where
}

function normalizeAppointmentData(data, parseDateTime) {
  const normalized = {}

  if ('clientId' in data) normalized.clientId = data.clientId
  if ('serviceId' in data) normalized.serviceId = data.serviceId
  if ('professionalId' in data) normalized.professionalId = data.professionalId
  if ('startAt' in data) normalized.startAt = parseDateTime(data.startAt, 'startAt')
  if ('endAt' in data) normalized.endAt = parseDateTime(data.endAt, 'endAt')
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('price' in data) normalized.price = data.price
  if ('status' in data) normalized.status = data.status

  return normalized
}

async function ensureEditableAppointmentOwnership({ prisma, userId, appointmentId, assertClientProntuarioEditable }) {
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
  ensureEditableClientOwnership,
  ensureServiceOwnership,
  ensureProfessionalOwnership,
}) {
  await Promise.all([
    ensureEditableClientOwnership(userId, data.clientId),
    ensureServiceOwnership(userId, data.serviceId),
    ensureProfessionalOwnership(userId, data.professionalId),
  ])
}

async function ensureProfessionalAvailability({
  prisma,
  httpError,
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

function validateAppointmentWindow({ appointmentData, httpError }) {
  if (appointmentData.endAt <= appointmentData.startAt) {
    throw httpError(422, 'O horario final deve ser maior que o inicial')
  }
}

function registerAppointmentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateTime,
  httpError,
  appointmentSchema,
  ensureEditableClientOwnership,
  ensureServiceOwnership,
  ensureProfessionalOwnership,
  assertClientProntuarioEditable,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    handle,
    parseId,
    parseDateTime,
    httpError,
    appointmentSchema,
    ensureEditableClientOwnership,
    ensureServiceOwnership,
    ensureProfessionalOwnership,
    assertClientProntuarioEditable,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerAppointmentRoutes requer ${key}`)
    }
  }

  app.get('/appointments', authMiddleware, handle(async (req, res) => {
    const where = buildAppointmentWhere({
      userId: req.user.id,
      query: req.query,
      parseId,
      parseDateTime,
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
    const appointmentData = normalizeAppointmentData(data, parseDateTime)

    validateAppointmentWindow({ appointmentData, httpError })

    await ensureAppointmentReferences({
      userId: req.user.id,
      data: appointmentData,
      ensureEditableClientOwnership,
      ensureServiceOwnership,
      ensureProfessionalOwnership,
    })

    if (!shouldSkipAvailabilityCheck(appointmentData.status)) {
      await ensureProfessionalAvailability({
        prisma,
        httpError,
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
      assertClientProntuarioEditable,
    })
    const updateData = normalizeAppointmentData(data, parseDateTime)
    const nextAppointment = { ...currentAppointment, ...updateData }

    validateAppointmentWindow({ appointmentData: nextAppointment, httpError })

    await ensureAppointmentReferences({
      userId: req.user.id,
      data: nextAppointment,
      ensureEditableClientOwnership,
      ensureServiceOwnership,
      ensureProfessionalOwnership,
    })

    if (!shouldSkipAvailabilityCheck(nextAppointment.status)) {
      await ensureProfessionalAvailability({
        prisma,
        httpError,
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
      assertClientProntuarioEditable,
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
