function normalizePaymentData(data, parseDateTime, now = () => new Date()) {
  const normalized = {}

  if ('appointmentId' in data) normalized.appointmentId = data.appointmentId
  if ('amount' in data) normalized.amount = data.amount
  if ('method' in data) normalized.method = data.method
  if ('status' in data) normalized.status = data.status
  if ('paidAt' in data) {
    normalized.paidAt = data.paidAt ? parseDateTime(data.paidAt, 'paidAt') : null
  } else if (data.status === 'PAID') {
    normalized.paidAt = now()
  }

  return normalized
}

function buildPaidClientLockData({ appointment, record, now = () => new Date() }) {
  return {
    isPaid: true,
    isLocked: true,
    lockedAt: appointment.client.lockedAt || record.paidAt || now(),
  }
}

async function applyPaidPaymentSideEffects({ tx, appointment, appointmentId, record, now }) {
  if (record.status !== 'PAID') return

  await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } })
  await tx.client.update({
    where: { id: appointment.client.id },
    data: buildPaidClientLockData({ appointment, record, now }),
  })
}

function registerPaymentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateTime,
  paymentSchema,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    handle,
    parseId,
    parseDateTime,
    paymentSchema,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerPaymentRoutes requer ${key}`)
    }
  }

  app.post('/payments', authMiddleware, handle(async (req, res) => {
    const data = paymentSchema.parse(req.body)
    const paymentData = normalizePaymentData(data, parseDateTime)

    const payment = await prisma.$transaction(async tx => {
      const appointment = await tx.appointment.findFirstOrThrow({
        where: { id: data.appointmentId, userId: req.user.id },
        include: {
          client: {
            select: { id: true, isPaid: true, isLocked: true, lockedAt: true },
          },
        },
      })

      const record = await tx.payment.upsert({
        where: { appointmentId: data.appointmentId },
        create: { ...paymentData, appointmentId: data.appointmentId },
        update: paymentData,
      })

      await applyPaidPaymentSideEffects({
        tx,
        appointment,
        appointmentId: data.appointmentId,
        record,
      })

      return record
    })

    res.status(201).json(payment)
  }))

  app.put('/payments/:id', authMiddleware, handle(async (req, res) => {
    const paymentId = parseId(req.params.id, 'paymentId')
    const data = paymentSchema.partial().parse(req.body)
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    const paymentData = normalizePaymentData(data, parseDateTime)

    const updatedPayment = await prisma.$transaction(async tx => {
      const appointment = await tx.appointment.findFirstOrThrow({
        where: { id: payment.appointmentId, userId: req.user.id },
        include: {
          client: {
            select: { id: true, isPaid: true, isLocked: true, lockedAt: true },
          },
        },
      })

      const record = await tx.payment.update({ where: { id: paymentId }, data: paymentData })

      await applyPaidPaymentSideEffects({
        tx,
        appointment,
        appointmentId: payment.appointmentId,
        record,
      })

      return record
    })

    res.json(updatedPayment)
  }))
}

module.exports = {
  applyPaidPaymentSideEffects,
  buildPaidClientLockData,
  normalizePaymentData,
  registerPaymentRoutes,
}
