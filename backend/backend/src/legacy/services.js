const {
  parseId,
  serviceSchema,
  normalizeServiceData,
  sanitizeFileName,
  sendPdfDocument,
  renderServicePopPdf,
  createAuditLogFromRequest,
  getRequestClinicId,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function buildServicePop({ clinicName, serviceName, description, duration }) {
  const safeClinicName = (clinicName || '').trim() || 'Clínica não informada'
  const safeServiceName = (serviceName || '').trim() || 'Procedimento estético'
  const descriptionText = (description || '').trim()
    || 'Descrever técnica, objetivo clínico, ativos, parâmetros e cuidados específicos deste procedimento.'
  const durationText = duration
    ? `${duration} minutos`
    : 'Tempo definido conforme avaliação profissional e protocolo da clínica.'

  return [
    'POP - Procedimento Operacional Padrão',
    '',
    `Clínica: ${safeClinicName}`,
    `Procedimento: ${safeServiceName}`,
    `Tempo médio de execução: ${durationText}`,
    '',
    '1. Objetivo',
    `Padronizar a execução do procedimento ${safeServiceName}, garantindo segurança, organização operacional, rastreabilidade e consistência no atendimento.`,
    '',
    '2. Indicação e contexto clínico',
    descriptionText,
    '',
    '3. Responsáveis',
    'O procedimento deve ser realizado por profissional habilitado, treinado e autorizado pela clínica, seguindo a avaliação individual da cliente e as normas sanitárias aplicáveis.',
    '',
    '4. Materiais e recursos necessários',
    'Separar EPIs, insumos, equipamentos, ficha de anamnese, termo de consentimento, prontuário e materiais auxiliares antes do início do atendimento.',
    '',
    '5. Preparo do ambiente e da cliente',
    'Confirmar higienização da bancada, organização dos materiais, validade dos produtos, identificação dos lotes e orientações prévias à cliente.',
    '',
    '6. Execução do procedimento',
    `Realizar o procedimento ${safeServiceName} conforme protocolo técnico da clínica, respeitando sequência operacional, tempo de exposição, parâmetros definidos e resposta clínica observada durante o atendimento.`,
    '',
    '7. Cuidados pós-procedimento',
    'Registrar orientações pós-atendimento, produtos recomendados, sinais esperados, restrições temporárias e retorno sugerido no prontuário da cliente.',
    '',
    '8. Intercorrências e conduta',
    'Qualquer reação inesperada, desconforto fora do previsto ou intercorrência deve ser registrada imediatamente, com descrição da conduta adotada e comunicação responsável à cliente.',
    '',
    '9. Registros obrigatórios',
    'Registrar data, profissional responsável, descrição resumida da sessão, produtos e equipamentos utilizados, efeitos observados e assinatura quando aplicável.',
    '',
    '10. Revisão do POP',
    'Este POP deve ser revisto sempre que houver atualização técnica, mudança de protocolo interno, alteração regulatória ou necessidade operacional identificada pela clínica.',
  ].join('\n')
}

function buildServicePopPayload({ userId, clinicName, service }) {
  return {
    userId,
    serviceId: service.id,
    title: `POP - ${service.name}`,
    content: buildServicePop({
      clinicName,
      serviceName: service.name,
      description: service.description,
      duration: service.duration,
    }),
  }
}

function summarizeServicePop(record) {
  if (!record) return null

  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    downloadName: `${record.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'pop'}.txt`,
  }
}

async function backfillMissingServicePops({ prisma, userId, clinicName, services }) {
  const missingServices = services.filter(service => !service.servicePop)

  if (missingServices.length === 0) {
    return false
  }

  await prisma.$transaction(missingServices.map(service => prisma.servicePop.upsert({
    where: { serviceId: service.id },
    create: buildServicePopPayload({ userId, clinicName, service }),
    update: {
      title: `POP - ${service.name}`,
      content: buildServicePop({
        clinicName,
        serviceName: service.name,
        description: service.description,
        duration: service.duration,
      }),
    },
  })))

  return true
}

async function ensureServicePopForService({ prisma, userId, clinicName, service }) {
  if (service.servicePop) {
    return service.servicePop
  }

  return prisma.servicePop.upsert({
    where: { serviceId: service.id },
    create: buildServicePopPayload({ userId, clinicName, service }),
    update: {
      title: `POP - ${service.name}`,
      content: buildServicePop({
        clinicName,
        serviceName: service.name,
        description: service.description,
        duration: service.duration,
      }),
    },
  })
}

function getScopedServiceUserId(req) {
  return req.currentUser?.id || req.user?.id
}

function buildServiceAuditMetadata(service, extra = {}) {
  return {
    name: service?.name || null,
    description: service?.description || null,
    duration: service?.duration ?? null,
    price: service?.price ?? null,
    active: service?.active ?? null,
    hasPop: Boolean(service?.servicePop),
    ...extra,
  }
}

async function getClinicName(prisma, userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { clinicName: true },
  })

  return user.clinicName || "L'Appui"
}

function registerServiceRoutes(options) {
  const {
    app,
    prisma,
    authMiddleware = require('./lib/middlewares').authMiddleware,
    handle = require('./lib/middlewares').handle,
    parseId = require('./lib/helpers').parseId,
    serviceSchema = require('./lib/helpers').serviceSchema,
    normalizeServiceData = require('./lib/helpers').normalizeServiceData,
    sanitizeFileName = require('./lib/helpers').sanitizeFileName,
    sendPdfDocument = require('./lib/helpers').sendPdfDocument,
    renderServicePopPdf = require('./lib/helpers').renderServicePopPdf,
    createAuditLogFromRequest = require('./lib/helpers').createAuditLogFromRequest,
    getRequestClinicId = require('./lib/helpers').getRequestClinicId,
  } = options

  app.get('/services', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const getServices = () => prisma.service.findMany({
      where: { userId, active: true },
      include: {
        servicePop: {
          select: { id: true, title: true, updatedAt: true, content: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    let list = await getServices()
    const backfilled = await backfillMissingServicePops({
      prisma,
      userId,
      clinicName: req.currentUser?.clinicName || "L'Appui",
      services: list,
    })

    if (backfilled) {
      list = await getServices()
    }

    res.json(list.map(({ servicePop, ...service }) => ({
      ...service,
      servicePop: summarizeServicePop(servicePop),
    })))
  }))

  app.post('/services', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const data = serviceSchema.parse(req.body)
    const normalized = normalizeServiceData(data)
    const clinicName = await getClinicName(prisma, userId)

    const service = await prisma.$transaction(async tx => {
      const createdService = await tx.service.create({ data: { ...normalized, userId } })

      const pop = await tx.servicePop.create({
        data: buildServicePopPayload({
          userId,
          clinicName,
          service: createdService,
        }),
      })

      return {
        ...createdService,
        servicePop: {
          ...summarizeServicePop(pop),
          content: pop.content,
          service: {
            id: createdService.id,
            name: createdService.name,
            duration: createdService.duration,
          },
        },
      }
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'SERVICE_CREATE',
      entityType: 'Service',
      entityId: service.id,
      metadata: buildServiceAuditMetadata(service, { hasPop: true }),
    })

    res.status(201).json(service)
  }))

  app.put('/services/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const serviceId = parseId(req.params.id, 'serviceId')
    const data = serviceSchema.partial().parse(req.body)
    const clinicName = await getClinicName(prisma, userId)
    const currentService = await prisma.service.findFirstOrThrow({ where: { id: serviceId, userId } })
    const updateData = normalizeServiceData(data)
    const nextService = { ...currentService, ...updateData }

    const service = await prisma.$transaction(async tx => {
      const updatedService = await tx.service.update({ where: { id: serviceId }, data: updateData })

      const pop = await tx.servicePop.upsert({
        where: { serviceId },
        create: buildServicePopPayload({
          userId,
          clinicName,
          service: nextService,
        }),
        update: {
          title: `POP - ${nextService.name}`,
          content: buildServicePop({
            clinicName,
            serviceName: nextService.name,
            description: nextService.description,
            duration: nextService.duration,
          }),
        },
      })

      return {
        ...updatedService,
        servicePop: summarizeServicePop(pop),
      }
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'SERVICE_UPDATE',
      entityType: 'Service',
      entityId: serviceId,
      metadata: buildServiceAuditMetadata(service, {
        previous: buildServiceAuditMetadata(currentService),
      }),
    })

    res.json(service)
  }))

  app.get('/services/:id/pop', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const serviceId = parseId(req.params.id, 'serviceId')
    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, userId },
      include: { servicePop: true },
    })

    const pop = await ensureServicePopForService({
      prisma,
      userId,
      clinicName: req.currentUser?.clinicName || "L'Appui",
      service,
    })

    res.json({
      ...summarizeServicePop(pop),
      content: pop.content,
      service: {
        id: service.id,
        name: service.name,
        duration: service.duration,
      },
    })
  }))

  app.get('/services/:id/pop/pdf', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const serviceId = parseId(req.params.id, 'serviceId')
    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, userId },
      include: { servicePop: true },
    })

    const pop = await ensureServicePopForService({
      prisma,
      userId,
      clinicName: req.currentUser?.clinicName || "L'Appui",
      service,
    })

    const filename = `${sanitizeFileName(pop.title || `pop-${service.name}`, 'pop')}.pdf`
    sendPdfDocument(res, filename, doc => {
      renderServicePopPdf(doc, {
        clinicName: req.currentUser?.clinicName,
        service: {
          name: service.name,
          duration: service.duration,
        },
        pop,
      })
    })
  }))

  app.delete('/services/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedServiceUserId(req)
    const serviceId = parseId(req.params.id, 'serviceId')
    const previousService = await prisma.service.findFirstOrThrow({ where: { id: serviceId, userId } })
    await prisma.service.updateMany({ where: { id: serviceId, userId }, data: { active: false } })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'SERVICE_ARCHIVE',
      entityType: 'Service',
      entityId: serviceId,
      metadata: buildServiceAuditMetadata(previousService, { active: false }),
    })

    res.json({ ok: true })
  }))
}

module.exports = {
  backfillMissingServicePops,
  buildServiceAuditMetadata,
  buildServicePop,
  buildServicePopPayload,
  ensureServicePopForService,
  getScopedServiceUserId,
  registerServiceRoutes,
  summarizeServicePop,
}
