function buildServicePop({ clinicName, serviceName, description, duration }) {
  const safeClinicName = (clinicName || '').trim() || 'Clinica nao informada'
  const safeServiceName = (serviceName || '').trim() || 'Procedimento estetico'
  const descriptionText = (description || '').trim()
    || 'Descrever tecnica, objetivo clinico, ativos, parametros e cuidados especificos deste procedimento.'
  const durationText = duration
    ? `${duration} minutos`
    : 'Tempo definido conforme avaliacao profissional e protocolo da clinica.'

  return [
    'POP - Procedimento Operacional Padrao',
    '',
    `Clinica: ${safeClinicName}`,
    `Procedimento: ${safeServiceName}`,
    `Tempo medio de execucao: ${durationText}`,
    '',
    '1. Objetivo',
    `Padronizar a execucao do procedimento ${safeServiceName}, garantindo seguranca, organizacao operacional, rastreabilidade e consistencia no atendimento.`,
    '',
    '2. Indicacao e contexto clinico',
    descriptionText,
    '',
    '3. Responsaveis',
    'O procedimento deve ser realizado por profissional habilitado, treinado e autorizado pela clinica, seguindo a avaliacao individual da cliente e as normas sanitarias aplicaveis.',
    '',
    '4. Materiais e recursos necessarios',
    'Separar EPIs, insumos, equipamentos, ficha de anamnese, termo de consentimento, prontuario e materiais auxiliares antes do inicio do atendimento.',
    '',
    '5. Preparo do ambiente e da cliente',
    'Confirmar higienizacao da bancada, organizacao dos materiais, validade dos produtos, identificacao dos lotes e orientacoes previas a cliente.',
    '',
    '6. Execucao do procedimento',
    `Realizar o procedimento ${safeServiceName} conforme protocolo tecnico da clinica, respeitando sequencia operacional, tempo de exposicao, parametros definidos e resposta clinica observada durante o atendimento.`,
    '',
    '7. Cuidados pos-procedimento',
    'Registrar orientacoes pos-atendimento, produtos recomendados, sinais esperados, restricoes temporarias e retorno sugerido no prontuario da cliente.',
    '',
    '8. Intercorrencias e conduta',
    'Qualquer reacao inesperada, desconforto fora do previsto ou intercorrencia deve ser registrada imediatamente, com descricao da conduta adotada e comunicacao responsavel a cliente.',
    '',
    '9. Registros obrigatorios',
    'Registrar data, profissional responsavel, descricao resumida da sessao, produtos e equipamentos utilizados, efeitos observados e assinatura quando aplicavel.',
    '',
    '10. Revisao do POP',
    'Este POP deve ser revisto sempre que houver atualizacao tecnica, mudanca de protocolo interno, alteracao regulatoria ou necessidade operacional identificada pela clinica.',
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

async function getClinicName(prisma, userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { clinicName: true },
  })

  return user.clinicName || "L'Appui"
}

function registerServiceRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  serviceSchema,
  normalizeServiceData,
  sanitizeFileName,
  sendPdfDocument,
  renderServicePopPdf,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    handle,
    parseId,
    serviceSchema,
    normalizeServiceData,
    sanitizeFileName,
    sendPdfDocument,
    renderServicePopPdf,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerServiceRoutes requer ${key}`)
    }
  }

  app.get('/services', authMiddleware, handle(async (req, res) => {
    const getServices = () => prisma.service.findMany({
      where: { userId: req.user.id, active: true },
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
      userId: req.user.id,
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
    const data = serviceSchema.parse(req.body)
    const normalized = normalizeServiceData(data)
    const clinicName = await getClinicName(prisma, req.user.id)

    const service = await prisma.$transaction(async tx => {
      const createdService = await tx.service.create({ data: { ...normalized, userId: req.user.id } })

      const pop = await tx.servicePop.create({
        data: buildServicePopPayload({
          userId: req.user.id,
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

    res.status(201).json(service)
  }))

  app.put('/services/:id', authMiddleware, handle(async (req, res) => {
    const serviceId = parseId(req.params.id, 'serviceId')
    const data = serviceSchema.partial().parse(req.body)
    const clinicName = await getClinicName(prisma, req.user.id)
    const currentService = await prisma.service.findFirstOrThrow({ where: { id: serviceId, userId: req.user.id } })
    const updateData = normalizeServiceData(data)
    const nextService = { ...currentService, ...updateData }

    const service = await prisma.$transaction(async tx => {
      const updatedService = await tx.service.update({ where: { id: serviceId }, data: updateData })

      const pop = await tx.servicePop.upsert({
        where: { serviceId },
        create: buildServicePopPayload({
          userId: req.user.id,
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

    res.json(service)
  }))

  app.get('/services/:id/pop', authMiddleware, handle(async (req, res) => {
    const serviceId = parseId(req.params.id, 'serviceId')
    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, userId: req.user.id },
      include: { servicePop: true },
    })

    const pop = await ensureServicePopForService({
      prisma,
      userId: req.user.id,
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
    const serviceId = parseId(req.params.id, 'serviceId')
    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, userId: req.user.id },
      include: { servicePop: true },
    })

    const pop = await ensureServicePopForService({
      prisma,
      userId: req.user.id,
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
    const serviceId = parseId(req.params.id, 'serviceId')
    await prisma.service.updateMany({ where: { id: serviceId, userId: req.user.id }, data: { active: false } })
    res.json({ ok: true })
  }))
}

module.exports = {
  backfillMissingServicePops,
  buildServicePop,
  buildServicePopPayload,
  ensureServicePopForService,
  registerServiceRoutes,
  summarizeServicePop,
}
