const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { compactObject, httpError, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { assertMedicalRecordEditable } = require('../middleware/medical-record-lock')
const {
  clientCreateSchema,
  clientStatusPatchSchema,
  clientUpdateSchema,
  clientsListQuerySchema,
  idParamSchema,
} = require('../schemas')

const clientsRouter = express.Router()
const clientDetailInclude = {
  medicalRecord: true,
  protocols: true,
  appointments: true,
  payments: true,
  pdfDocuments: true,
  whatsappMessages: true,
}

const clientOverviewInclude = {
  medicalRecord: {
    include: {
      anamnesis: {
        include: {
          aestheticHistory: true,
        },
      },
      aestheticEvaluations: true,
      protocols: {
        include: {
          services: {
            include: {
              service: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      pdfDocuments: {
        orderBy: { generatedAt: 'desc' },
      },
    },
  },
  protocols: {
    include: {
      services: {
        include: { service: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
  appointments: {
    orderBy: { scheduledAt: 'desc' },
  },
  payments: {
    orderBy: { createdAt: 'desc' },
  },
  pdfDocuments: {
    orderBy: { generatedAt: 'desc' },
  },
  whatsappMessages: {
    orderBy: { createdAt: 'desc' },
  },
}

function buildClientOverview(client) {
  const record = client.medicalRecord || null
  const latestProtocol = client.protocols?.[0] || record?.protocols?.[0] || null
  const latestPayment = client.payments?.[0] || record?.payments?.[0] || null
  const latestAppointment = client.appointments?.[0] || null
  const latestDocument = client.pdfDocuments?.[0] || record?.pdfDocuments?.[0] || null

  return {
    client: {
      id: client.id,
      fullName: client.fullName,
      phone: client.phone,
      email: client.email,
      status: client.status,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    medicalRecord: record ? {
      id: record.id,
      isPaid: record.isPaid,
      isLocked: record.isLocked,
      lockedAt: record.lockedAt,
      hasAnamnesis: Boolean(record.anamnesis),
      evaluationsCount: record.aestheticEvaluations?.length || 0,
    } : null,
    counts: {
      appointments: client.appointments?.length || 0,
      protocols: client.protocols?.length || 0,
      payments: client.payments?.length || 0,
      documents: client.pdfDocuments?.length || 0,
      whatsappMessages: client.whatsappMessages?.length || 0,
    },
    latest: {
      protocol: latestProtocol ? {
        id: latestProtocol.id,
        protocolName: latestProtocol.protocolName,
        status: latestProtocol.status,
        createdAt: latestProtocol.createdAt,
      } : null,
      payment: latestPayment ? {
        id: latestPayment.id,
        paymentStatus: latestPayment.paymentStatus,
        amount: latestPayment.amount,
        paidAt: latestPayment.paidAt,
        createdAt: latestPayment.createdAt,
      } : null,
      appointment: latestAppointment ? {
        id: latestAppointment.id,
        status: latestAppointment.status,
        scheduledAt: latestAppointment.scheduledAt,
      } : null,
      document: latestDocument ? {
        id: latestDocument.id,
        fileName: latestDocument.fileName,
        documentType: latestDocument.documentType,
        generatedAt: latestDocument.generatedAt,
      } : null,
    },
    access: {
      readOnly: Boolean(record?.isLocked),
      canEdit: !record?.isLocked,
      canDownloadPdf: true,
    },
  }
}

function buildClientTimeline(client) {
  const record = client.medicalRecord || null
  const items = []

  if (record?.anamnesis) {
    items.push({
      type: 'anamnesis',
      occurredAt: record.anamnesis.updatedAt || record.anamnesis.createdAt,
      label: 'Anamnese atualizada',
      status: record.isLocked ? 'read_only' : 'editable',
      entityId: record.anamnesis.id,
    })
  }

  for (const payment of client.payments || []) {
    items.push({
      type: 'payment',
      occurredAt: payment.paidAt || payment.updatedAt || payment.createdAt,
      label: 'Pagamento ' + payment.paymentStatus,
      status: payment.paymentStatus,
      entityId: payment.id,
    })
  }

  for (const appointment of client.appointments || []) {
    items.push({
      type: 'appointment',
      occurredAt: appointment.scheduledAt,
      label: 'Atendimento ' + appointment.status,
      status: appointment.status,
      entityId: appointment.id,
    })
  }

  for (const protocol of client.protocols || []) {
    items.push({
      type: 'protocol',
      occurredAt: protocol.updatedAt || protocol.createdAt,
      label: protocol.protocolName,
      status: protocol.status,
      entityId: protocol.id,
    })
  }

  for (const document of client.pdfDocuments || []) {
    items.push({
      type: 'document',
      occurredAt: document.generatedAt || document.createdAt,
      label: document.fileName,
      status: document.documentType,
      entityId: document.id,
    })
  }

  return items
    .filter(item => Boolean(item.occurredAt))
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
}

clientsRouter.get('/', requireAuth, validate({ query: clientsListQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const search = req.query.search?.trim()
  const where = compactObject({
    status: req.query.status,
    OR: search ? [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { cpf: { contains: search, mode: 'insensitive' } },
    ] : undefined,
  })

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
      include: { medicalRecord: true },
    }),
    prisma.client.count({ where }),
  ])

  return sendPaginated(res, items, total, pagination)
}))

clientsRouter.post('/', requireAuth, validate({ body: clientCreateSchema }), asyncHandler(async (req, res) => {
  const created = await prisma.$transaction(async tx => {
    const client = await tx.client.create({
      data: compactObject({
        fullName: req.body.fullName,
        cpf: req.body.cpf ?? null,
        birthDate: req.body.birthDate ? new Date(req.body.birthDate) : null,
        phone: req.body.phone ?? null,
        email: req.body.email ?? null,
        emergencyContactName: req.body.emergencyContactName ?? null,
        emergencyContactPhone: req.body.emergencyContactPhone ?? null,
        status: req.body.status || 'active',
      }),
    })

    await tx.medicalRecord.create({
      data: { clientId: client.id },
    })

    const hydrated = await tx.client.findUnique({
      where: { id: client.id },
      include: clientDetailInclude,
    })

    await recordAudit(tx, {
      entityType: 'Client',
      entityId: client.id,
      actionType: 'create',
      userName: req.auth?.email || null,
      newData: hydrated,
    })

    return hydrated
  })

  res.status(201).json(created)
}))

clientsRouter.get('/:id/overview', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: clientOverviewInclude,
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado.')
  }

  res.json(buildClientOverview(client))
}))

clientsRouter.get('/:id/timeline', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: clientOverviewInclude,
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado.')
  }

  const items = buildClientTimeline(client)
  res.json({
    items,
    meta: {
      total: items.length,
      readOnly: Boolean(client.medicalRecord?.isLocked),
    },
  })
}))

clientsRouter.get('/:id/medical-record', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      medicalRecord: {
        include: {
          anamnesis: {
            include: {
              aestheticHistory: true,
            },
          },
          aestheticEvaluations: true,
          protocols: {
            include: {
              services: {
                include: {
                  service: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
          payments: true,
          pdfDocuments: true,
        },
      },
    },
  })

  if (!client?.medicalRecord) {
    throw httpError(404, 'Prontuario nao encontrado para este cliente.')
  }

  res.json(client.medicalRecord)
}))

clientsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: clientDetailInclude,
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado.')
  }

  res.json(client)
}))

clientsRouter.patch('/:id', requireAuth, validate({ params: idParamSchema, body: clientUpdateSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.client.findUnique({
      where: { id: req.params.id },
      include: { medicalRecord: true },
    })

    if (!current) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    if (current.medicalRecord?.id) {
      await assertMedicalRecordEditable(tx, current.medicalRecord.id)
    }

    const next = await tx.client.update({
      where: { id: req.params.id },
      data: compactObject({
        fullName: req.body.fullName,
        cpf: req.body.cpf,
        birthDate: req.body.birthDate ? new Date(req.body.birthDate) : req.body.birthDate === null ? null : undefined,
        phone: req.body.phone,
        email: req.body.email,
        emergencyContactName: req.body.emergencyContactName,
        emergencyContactPhone: req.body.emergencyContactPhone,
        status: req.body.status,
      }),
      include: clientDetailInclude,
    })

    await recordAudit(tx, {
      entityType: 'Client',
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

clientsRouter.patch('/:id/status', requireAuth, validate({ params: idParamSchema, body: clientStatusPatchSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.client.findUnique({ where: { id: req.params.id } })
    if (!current) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    const next = await tx.client.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
      include: clientDetailInclude,
    })

    await recordAudit(tx, {
      entityType: 'Client',
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

module.exports = {
  clientsRouter,
}
