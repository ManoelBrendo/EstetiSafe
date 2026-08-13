const {
  parseId,
  getScopedRequestUserId,
  startOfMonth,
  startOfNextMonth,
  buildProfessionalPayrollMetrics,
  summarizeProfessional,
  buildProfessionalDocumentsDashboard,
  ensureProfessionalOwnership,
  professionalDocumentSchema,
  normalizeProfessionalDocumentData,
  summarizeProfessionalDocument,
  ensureProfessionalDocumentOwnership,
  professionalSchema,
  normalizeProfessionalData,
  createAuditLogFromRequest,
  getRequestClinicId,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerLegacyProfessionalRoutes({
  app,
  prisma,
}) {
  app.get('/professionals', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const now = new Date()
    const periodStart = startOfMonth(now)
    const periodEnd = startOfNextMonth(now)
    const list = await prisma.professional.findMany({
      where: { userId, active: true },
      include: {
        documents: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    const professionalIds = list.map(professional => professional.id)
    const periodAppointments = professionalIds.length
      ? await prisma.appointment.findMany({
        where: {
          userId,
          professionalId: { in: professionalIds },
          startAt: {
            gte: periodStart,
            lt: periodEnd,
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: {
          payment: { select: { amount: true, status: true, paidAt: true } },
        },
      })
      : []

    const appointmentsByProfessional = new Map()
    for (const appointment of periodAppointments) {
      const current = appointmentsByProfessional.get(appointment.professionalId) || []
      current.push(appointment)
      appointmentsByProfessional.set(appointment.professionalId, current)
    }

    res.json(list.map(professional => ({
      ...summarizeProfessional(professional),
      payroll: {
        ...buildProfessionalPayrollMetrics({
          professional,
          appointments: appointmentsByProfessional.get(professional.id) || [],
        }),
        periodStart,
        periodEnd,
      },
    })))
  }))

  app.get('/professionals/documents/summary', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)

    const [professionals, documents] = await Promise.all([
      prisma.professional.findMany({
        where: { userId, active: true },
        orderBy: { name: 'asc' },
      }),
      prisma.professionalDocument.findMany({
        where: { userId },
        include: {
          professional: { select: { id: true, name: true, specialty: true, active: true } },
        },
        orderBy: [
          { expiresAt: 'asc' },
          { updatedAt: 'desc' },
        ],
      }),
    ])

    res.json(buildProfessionalDocumentsDashboard(professionals, documents))
  }))

  app.get('/professionals/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const professionalId = parseId(req.params.id, 'professionalId')
    const now = new Date()
    const periodStart = startOfMonth(now)
    const periodEnd = startOfNextMonth(now)

    const [professional, totalAppointments, completedAppointments, upcomingAppointments, periodAppointments] = await Promise.all([
      prisma.professional.findFirstOrThrow({
        where: { id: professionalId, userId, active: true },
        include: {
          appointments: {
            include: {
              client: { select: { id: true, name: true } },
              service: { select: { id: true, name: true, duration: true } },
              payment: { select: { amount: true, status: true, paidAt: true } },
            },
            orderBy: { startAt: 'desc' },
            take: 12,
          },
          documents: {
            orderBy: { updatedAt: 'desc' },
          },
        },
      }),
      prisma.appointment.count({
        where: {
          userId,
          professionalId,
        },
      }),
      prisma.appointment.count({
        where: {
          userId,
          professionalId,
          status: 'COMPLETED',
        },
      }),
      prisma.appointment.count({
        where: {
          userId,
          professionalId,
          startAt: { gte: new Date() },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      }),
      prisma.appointment.findMany({
        where: {
          userId,
          professionalId,
          startAt: {
            gte: periodStart,
            lt: periodEnd,
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: {
          payment: { select: { amount: true, status: true, paidAt: true } },
        },
      }),
    ])

    const payroll = buildProfessionalPayrollMetrics({
      professional,
      appointments: periodAppointments,
    })

    res.json({
      ...summarizeProfessional(professional),
      metrics: {
        totalAppointments,
        completedAppointments,
        upcomingAppointments,
      },
      payroll: {
        ...payroll,
        periodStart,
        periodEnd,
      },
      appointments: professional.appointments.map(appointment => ({
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        notes: appointment.notes,
        price: appointment.price,
        client: appointment.client,
        service: appointment.service,
        payment: appointment.payment,
      })),
      documents: (professional.documents || []).map(summarizeProfessionalDocument),
      documentsDashboard: buildProfessionalDocumentsDashboard([professional], professional.documents || []),
    })
  }))

  app.get('/professionals/:id/documents', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const professionalId = parseId(req.params.id, 'professionalId')

    await ensureProfessionalOwnership(userId, professionalId)

    const documents = await prisma.professionalDocument.findMany({
      where: { userId, professionalId },
      include: {
        professional: { select: { id: true, name: true, specialty: true, active: true } },
      },
      orderBy: [
        { expiresAt: 'asc' },
        { updatedAt: 'desc' },
      ],
    })

    res.json(documents.map(summarizeProfessionalDocument))
  }))

  app.post('/professionals/:id/documents', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const professionalId = parseId(req.params.id, 'professionalId')
    const data = professionalDocumentSchema.parse(req.body)
    const professional = await ensureProfessionalOwnership(userId, professionalId)

    const document = await prisma.professionalDocument.create({
      data: {
        ...normalizeProfessionalDocumentData(data),
        userId,
        professionalId,
      },
      include: {
        professional: { select: { id: true, name: true, specialty: true, active: true } },
      },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'PROFESSIONAL_DOCUMENT_CREATE',
      entityType: 'ProfessionalDocument',
      entityId: document.id,
      metadata: {
        professionalId,
        professionalName: professional.name,
        category: data.category,
        documentType: data.documentType,
        expiresAt: data.expiresAt || null,
        fileName: data.fileName,
      },
    })

    res.status(201).json(summarizeProfessionalDocument(document))
  }))

  app.get('/professional-documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const document = await ensureProfessionalDocumentOwnership(userId, documentId)

    res.json({
      ...summarizeProfessionalDocument(document),
      fileDataUrl: document.fileDataUrl,
    })
  }))

  app.put('/professional-documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const data = professionalDocumentSchema.partial().parse(req.body)
    const previousDocument = await ensureProfessionalDocumentOwnership(userId, documentId)

    const document = await prisma.professionalDocument.update({
      where: { id: documentId },
      data: normalizeProfessionalDocumentData(data),
      include: {
        professional: { select: { id: true, name: true, specialty: true, active: true } },
      },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'PROFESSIONAL_DOCUMENT_UPDATE',
      entityType: 'ProfessionalDocument',
      entityId: document.id,
      metadata: {
        professionalId: previousDocument.professionalId,
        professionalName: previousDocument.professional?.name || null,
        changedFields: Object.keys(data),
        category: document.category,
        documentType: document.documentType,
        expiresAt: document.expiresAt,
      },
    })

    res.json(summarizeProfessionalDocument(document))
  }))

  app.delete('/professional-documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const previousDocument = await ensureProfessionalDocumentOwnership(userId, documentId)

    await prisma.professionalDocument.delete({ where: { id: documentId } })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'PROFESSIONAL_DOCUMENT_DELETE',
      entityType: 'ProfessionalDocument',
      entityId: documentId,
      metadata: {
        professionalId: previousDocument.professionalId,
        professionalName: previousDocument.professional?.name || null,
        category: previousDocument.category,
        documentType: previousDocument.documentType,
        fileName: previousDocument.fileName,
      },
    })

    res.json({ ok: true })
  }))

  app.post('/professionals', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const data = professionalSchema.parse(req.body)
    const professional = await prisma.professional.create({ data: { ...normalizeProfessionalData(data), userId } })
    res.status(201).json(summarizeProfessional(professional))
  }))

  app.put('/professionals/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const professionalId = parseId(req.params.id, 'professionalId')
    const data = professionalSchema.partial().parse(req.body)

    await prisma.professional.findFirstOrThrow({ where: { id: professionalId, userId } })
    const professional = await prisma.professional.update({ where: { id: professionalId }, data: normalizeProfessionalData(data) })
    res.json(summarizeProfessional(professional))
  }))

  app.delete('/professionals/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const professionalId = parseId(req.params.id, 'professionalId')
    await prisma.professional.updateMany({ where: { id: professionalId, userId }, data: { active: false } })
    res.json({ ok: true })
  }))
}

module.exports = {
  registerLegacyProfessionalRoutes,
}
