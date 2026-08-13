const {
  parseId,
  clientSchema,
  normalizeClientData,
  ensureEditableClientOwnership,
  summarizeAnamnesis,
  summarizeConsentRecord,
  createAuditLogFromRequest,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerLegacyClientRoutes({
  app,
  prisma,
}) {
  app.get('/clients', authMiddleware, handle(async (req, res) => {
    const search = String(req.query.search || '').trim()

    const clients = await prisma.client.findMany({
      where: {
        userId: req.user.id,
        deletedAt: null,
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        anamneses: {
          orderBy: { filledAt: 'desc' },
          take: 1,
        },
        consentRecords: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    res.json(clients.map(({ anamneses, consentRecords, ...client }) => ({
      ...client,
      latestAnamnesis: summarizeAnamnesis(anamneses[0]),
      latestConsentRecord: summarizeConsentRecord(consentRecords[0]),
    })))
  }))

  app.get('/clients/:id', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.id, 'clientId')

    const client = await prisma.client.findFirstOrThrow({
      where: { id: clientId, userId: req.user.id, deletedAt: null },
      include: {
        appointments: {
          include: { service: true, professional: true },
          orderBy: { startAt: 'desc' },
          take: 10,
        },
        anamneses: { orderBy: { filledAt: 'desc' }, take: 1 },
        consentRecords: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Registrar auditoria de leitura de prontuario sensível (LGPD)
    await createAuditLogFromRequest(req, {
      action: 'CLIENT_RECORD_READ',
      description: `Visualizou prontuário e ficha clínica do paciente ${client.name || 'Sem nome'}.`,
      severity: 'LOW',
      entityType: 'Client',
      entityId: client.id,
    }).catch(err => console.error('Erro ao registrar auditoria de leitura do cliente:', err))

    res.json(client)
  }))

  app.post('/clients', authMiddleware, handle(async (req, res) => {
    const data = clientSchema.parse(req.body)
    const client = await prisma.client.create({ data: { ...normalizeClientData(data), userId: req.user.id } })
    res.status(201).json(client)
  }))

  app.put('/clients/:id', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.id, 'clientId')
    const data = clientSchema.partial().parse(req.body)

    await ensureEditableClientOwnership(req.user.id, clientId)
    const client = await prisma.client.update({ where: { id: clientId }, data: normalizeClientData(data) })
    res.json(client)
  }))

  app.delete('/clients/:id', authMiddleware, handle(async (req, res) => {
    const clientId = parseId(req.params.id, 'clientId')
    await ensureEditableClientOwnership(req.user.id, clientId)
    await prisma.client.update({
      where: { id: clientId },
      data: { deletedAt: new Date() },
    })
    res.json({ ok: true })
  }))
}

module.exports = {
  registerLegacyClientRoutes,
}
