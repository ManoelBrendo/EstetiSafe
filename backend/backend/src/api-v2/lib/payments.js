const { parseOptionalDate, httpError } = require('./http')
const { ensureClientOwnership, buildAccessState } = require('./medical-records')

function normalizePaymentData(data) {
  const normalized = {}

  if ('amount' in data && data.amount !== undefined) normalized.amount = data.amount
  if ('method' in data && data.method !== undefined) normalized.method = data.method
  if ('status' in data && data.status !== undefined) normalized.status = data.status

  if ('paidAt' in data) {
    normalized.paidAt = data.paidAt ? parseOptionalDate(data.paidAt, 'paidAt') : null
  } else if (data.status === 'PAID') {
    normalized.paidAt = new Date()
  }

  return normalized
}

function serializeAppointmentReference(appointment) {
  return {
    id: appointment.id,
    status: appointment.status,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    price: appointment.price,
    notes: appointment.notes || null,
    service: appointment.service ? {
      id: appointment.service.id,
      name: appointment.service.name,
      duration: appointment.service.duration,
      price: appointment.service.price,
    } : null,
    professional: appointment.professional ? {
      id: appointment.professional.id,
      name: appointment.professional.name,
      specialty: appointment.professional.specialty,
    } : null,
  }
}

function serializePaymentRecord(record) {
  return {
    id: record.id,
    appointmentId: record.appointmentId,
    amount: record.amount,
    method: record.method,
    status: record.status,
    paidAt: record.paidAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    appointment: serializeAppointmentReference(record.appointment),
    client: record.appointment?.client ? {
      id: record.appointment.client.id,
      fullName: record.appointment.client.name,
      prontuarioStatus: buildAccessState(record.appointment.client),
    } : null,
  }
}

function buildPaymentSummary(records, unpaidAppointments) {
  const paid = records.filter(item => item.status === 'PAID')
  const pending = records.filter(item => item.status !== 'PAID')

  return {
    totalPayments: records.length,
    paidCount: paid.length,
    pendingCount: pending.length,
    paidAmount: paid.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    pendingAmount: pending.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    unpaidAppointments: unpaidAppointments.length,
  }
}

async function ensurePaymentOwnership(prisma, userId, paymentId) {
  const record = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      appointment: {
        userId,
      },
    },
    include: {
      appointment: {
        include: {
          client: true,
          service: true,
          professional: true,
        },
      },
    },
  })

  if (!record) {
    throw httpError(404, 'Pagamento nao encontrado.')
  }

  return record
}

async function listClientPayments(prisma, userId, clientId) {
  const client = await ensureClientOwnership(prisma, userId, clientId)

  const [payments, unpaidAppointments] = await Promise.all([
    prisma.payment.findMany({
      where: {
        appointment: {
          userId,
          clientId,
        },
      },
      include: {
        appointment: {
          include: {
            client: true,
            service: true,
            professional: true,
          },
        },
      },
      orderBy: [
        { paidAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    }),
    prisma.appointment.findMany({
      where: {
        userId,
        clientId,
        payment: null,
      },
      include: {
        service: true,
        professional: true,
      },
      orderBy: { startAt: 'desc' },
      take: 20,
    }),
  ])

  const items = payments.map(serializePaymentRecord)

  return {
    client: {
      id: client.id,
      fullName: client.name,
    },
    accessState: buildAccessState(client),
    items,
    unpaidAppointments: unpaidAppointments.map(serializeAppointmentReference),
    summary: buildPaymentSummary(items, unpaidAppointments),
  }
}

async function upsertAppointmentPayment(prisma, userId, payload) {
  const paymentData = normalizePaymentData(payload)

  return prisma.$transaction(async tx => {
    const appointment = await tx.appointment.findFirstOrThrow({
      where: { id: payload.appointmentId, userId },
      include: {
        client: true,
        service: true,
        professional: true,
      },
    })

    const payment = await tx.payment.upsert({
      where: { appointmentId: payload.appointmentId },
      create: {
        appointmentId: payload.appointmentId,
        ...paymentData,
      },
      update: paymentData,
    })

    if (payment.status === 'PAID') {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'COMPLETED' },
      })

      await tx.client.update({
        where: { id: appointment.client.id },
        data: {
          isPaid: true,
          isLocked: true,
          lockedAt: appointment.client.lockedAt || payment.paidAt || new Date(),
        },
      })
    }

    return tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: {
        appointment: {
          include: {
            client: true,
            service: true,
            professional: true,
          },
        },
      },
    })
  })
}

async function updatePayment(prisma, userId, paymentId, payload) {
  const paymentData = normalizePaymentData(payload)

  return prisma.$transaction(async tx => {
    const current = await tx.payment.findFirstOrThrow({
      where: {
        id: paymentId,
        appointment: {
          userId,
        },
      },
      include: {
        appointment: {
          include: {
            client: true,
          },
        },
      },
    })

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: paymentData,
    })

    if (updated.status === 'PAID') {
      await tx.appointment.update({
        where: { id: current.appointmentId },
        data: { status: 'COMPLETED' },
      })

      await tx.client.update({
        where: { id: current.appointment.client.id },
        data: {
          isPaid: true,
          isLocked: true,
          lockedAt: current.appointment.client.lockedAt || updated.paidAt || new Date(),
        },
      })
    }

    return tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        appointment: {
          include: {
            client: true,
            service: true,
            professional: true,
          },
        },
      },
    })
  })
}

module.exports = {
  serializePaymentRecord,
  ensurePaymentOwnership,
  listClientPayments,
  upsertAppointmentPayment,
  updatePayment,
}
