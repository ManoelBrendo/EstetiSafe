const { z } = require('zod')

const privacyEventActions = [
  'LGPD_EXPORT_REQUESTED',
  'LGPD_DELETION_REVIEW_REQUESTED',
  'CLINIC_PROFILE_UPDATED',
  'CONSENT_RECORD_IMAGE_USE_GENERATE',
  'CONSENT_RECORD_IMAGE_USE_REUSE_PENDING',
  'CONSENT_RECORD_REVOKE',
  'CONSENT_RECORD_SIGN',
  'MEDICAL_RECORD_PDF_DOWNLOAD',
  'MEDICAL_RECORD_ANAMNESIS_CREATED',
  'INTERCURRENCE_CREATE',
  'INTERCURRENCE_UPDATE',
]

const privacyRetentionPolicy = [
  {
    key: 'clinical_records',
    title: 'Prontuarios, anamneses e intercorrencias',
    retention: 'Retencao controlada conforme obrigacao legal, sanitaria e politica interna da clinica.',
    reason: 'Sao registros assistenciais sensiveis e nao devem ser apagados sem revisao formal.',
  },
  {
    key: 'consents',
    title: 'Termos de consentimento e autorizacoes',
    retention: 'Mantidos enquanto houver relacao com atendimento, imagem, prontuario ou defesa documental.',
    reason: 'Comprovam ciencia, autorizacao e rastreabilidade do atendimento.',
  },
  {
    key: 'audit',
    title: 'Logs de auditoria',
    retention: 'Mantidos para rastrear acessos, downloads, alteracoes e suporte tecnico.',
    reason: 'Protegem a clinica contra exclusoes indevidas e ajudam em investigacoes internas.',
  },
  {
    key: 'marketing',
    title: 'Comunicacoes e reativacao',
    retention: 'Uso condicionado a finalidade legitima, consentimento aplicavel e opt-out operacional.',
    reason: 'Mensagens comerciais precisam ser separadas de comunicacoes essenciais de atendimento.',
  },
]

const privacySecurityControls = [
  {
    key: 'audit_trail',
    title: 'Auditoria de eventos sensiveis',
    description: 'Downloads, assinaturas, revisoes LGPD e suporte tecnico ficam registrados.',
  },
  {
    key: 'consent_records',
    title: 'Consentimento com rastreabilidade',
    description: 'Termos assinados preservam hash, data, origem e status de revogacao quando aplicavel.',
  },
  {
    key: 'deletion_review',
    title: 'Exclusao somente por revisao',
    description: 'Dados clinicos nao sao apagados automaticamente; o sistema registra o pedido para analise.',
  },
  {
    key: 'support_trace',
    title: 'Suporte rastreado',
    description: 'Sessao tecnica ou impersonacao fica separada do usuario operacional da clinica.',
  },
  {
    key: 'external_ai_guardrail',
    title: 'IA externa desativada por padrao',
    description: 'Insights clinicos operam em modo deterministico ate configuracao explicita e revisao humana.',
  },
]

const deletionReviewSchema = z.object({
  clientId: z.preprocess(
    value => (value === '' || value === undefined ? null : value),
    z.coerce.number().int().positive().nullable()
  ).optional(),
  reason: z.string().trim().min(10, 'Informe um motivo com pelo menos 10 caracteres').max(1000),
})

function normalizeCount(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function isExpectedMissingModelError(error) {
  return (
    error?.code === 'P2021' ||
    error?.code === 'P2022' ||
    /does not exist|no such table|Unknown arg|Cannot read/i.test(String(error?.message || ''))
  )
}

async function countSafely(queryFactory) {
  try {
    return normalizeCount(await queryFactory())
  } catch (error) {
    if (isExpectedMissingModelError(error)) return 0
    throw error
  }
}

function buildPrivacyDataMap(counts = {}) {
  return [
    {
      key: 'clients',
      label: 'Clientes',
      count: normalizeCount(counts.clients),
      sensitivity: 'ALTA',
      retention: 'Cadastro ativo e historico operacional',
      description: 'Dados de identificacao, contato e vinculo com prontuario.',
    },
    {
      key: 'appointments',
      label: 'Agendamentos',
      count: normalizeCount(counts.appointments),
      sensitivity: 'MEDIA',
      retention: 'Historico assistencial e financeiro',
      description: 'Datas, status, servicos e confirmacoes associadas ao atendimento.',
    },
    {
      key: 'anamneses',
      label: 'Anamneses',
      count: normalizeCount(counts.anamneses),
      sensitivity: 'CRITICA',
      retention: 'Registro clinico sensivel',
      description: 'Informacoes de saude, riscos, restricoes e declaracoes da cliente.',
    },
    {
      key: 'consentRecords',
      label: 'Consentimentos',
      count: normalizeCount(counts.consentRecords),
      sensitivity: 'CRITICA',
      retention: 'Documento essencial de autorizacao',
      description: 'Termos, assinaturas, autorizacoes de imagem e revogacoes.',
    },
    {
      key: 'clinicDocuments',
      label: 'Documentos da clinica',
      count: normalizeCount(counts.clinicDocuments),
      sensitivity: 'ALTA',
      retention: 'Obrigacao administrativa e sanitaria',
      description: 'Licencas, POPs, documentos sanitarios e contratos operacionais.',
    },
    {
      key: 'intercurrences',
      label: 'Intercorrencias',
      count: normalizeCount(counts.intercurrences),
      sensitivity: 'CRITICA',
      retention: 'Historico profissional protegido',
      description: 'Descricao do evento, conduta adotada e profissional responsavel.',
    },
    {
      key: 'auditLogs',
      label: 'Auditoria',
      count: normalizeCount(counts.auditLogs),
      sensitivity: 'ALTA',
      retention: 'Rastreamento e seguranca',
      description: 'Eventos de acesso, alteracao, suporte, assinatura e downloads.',
    },
  ]
}

function buildPrivacySummary({ counts = {}, recentEvents = [], generatedAt = new Date() } = {}) {
  const normalizedCounts = Object.fromEntries(
    buildPrivacyDataMap(counts).map(item => [item.key, item.count])
  )

  const criticalAreas = buildPrivacyDataMap(normalizedCounts)
    .filter(item => item.sensitivity === 'CRITICA' && item.count > 0)
    .map(item => item.key)

  return {
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
    counts: normalizedCounts,
    inventory: buildPrivacyDataMap(normalizedCounts),
    criticalAreas,
    retentionPolicy: privacyRetentionPolicy,
    securityControls: privacySecurityControls,
    dataSubjectRights: [
      'Acesso e conferencia dos dados cadastrados',
      'Correcao de informacoes incorretas',
      'Revisao formal antes de qualquer eliminacao',
      'Registro de auditoria para acoes sensiveis',
    ],
    recentEvents: Array.isArray(recentEvents) ? recentEvents : [],
    message: 'Resumo LGPD gerado sem expor conteudo sensivel de prontuarios, anexos ou assinaturas.',
  }
}

async function getClinicPrivacySnapshot({ prisma, userId, clinicId, now = new Date() }) {
  const [
    clients,
    appointments,
    anamneses,
    consentRecords,
    clinicDocuments,
    intercurrences,
    auditLogs,
    recentEvents,
  ] = await Promise.all([
    countSafely(() => prisma.client.count({ where: { userId } })),
    countSafely(() => prisma.appointment.count({ where: { userId } })),
    countSafely(() => prisma.anamnesis.count({ where: { client: { userId } } })),
    countSafely(() => prisma.consentRecord.count({ where: { userId } })),
    countSafely(() => prisma.clinicDocument.count({ where: { userId } })),
    countSafely(() => prisma.clinicalIntercurrence.count({ where: { userId } })),
    clinicId ? countSafely(() => prisma.auditLog.count({ where: { clinicId } })) : 0,
    clinicId
      ? prisma.auditLog.findMany({
        where: {
          clinicId,
          action: { in: privacyEventActions },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          action: true,
          actorEmail: true,
          actorRole: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      }).catch(error => (isExpectedMissingModelError(error) ? [] : Promise.reject(error)))
      : [],
  ])

  return buildPrivacySummary({
    counts: {
      clients,
      appointments,
      anamneses,
      consentRecords,
      clinicDocuments,
      intercurrences,
      auditLogs,
    },
    recentEvents: recentEvents.map(event => ({
      ...event,
      createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
    })),
    generatedAt: now,
  })
}

function registerPrivacyRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  createAuditLogFromRequest,
  getRequestClinicId,
  httpError,
}) {
  if (!app || !prisma || !authMiddleware || !handle) {
    throw new Error('registerPrivacyRoutes requires app, prisma, authMiddleware and handle')
  }

  app.get('/clinic/privacy/summary', authMiddleware, handle(async (req, res) => {
    const clinicId = getRequestClinicId(req)
    const snapshot = await getClinicPrivacySnapshot({
      prisma,
      userId: req.currentUser.id,
      clinicId,
    })

    res.json(snapshot)
  }))

  app.post('/clinic/privacy/export', authMiddleware, handle(async (req, res) => {
    const clinicId = getRequestClinicId(req)
    const snapshot = await getClinicPrivacySnapshot({
      prisma,
      userId: req.currentUser.id,
      clinicId,
    })

    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'LGPD_EXPORT_REQUESTED',
      entityType: 'Clinic',
      entityId: clinicId ? String(clinicId) : null,
      metadata: {
        metadataOnly: true,
        counts: snapshot.counts,
      },
    })

    res.json({
      ok: true,
      export: {
        generatedAt: new Date().toISOString(),
        clinic: {
          id: clinicId,
          name: req.currentUser.clinicName,
          email: req.currentUser.email,
        },
        metadataOnly: true,
        privacy: snapshot,
      },
      message: 'Inventario LGPD gerado com metadados e sem conteudo sensivel bruto.',
    })
  }))

  app.post('/clinic/privacy/deletion-review', authMiddleware, handle(async (req, res) => {
    const data = deletionReviewSchema.parse(req.body || {})
    const clientId = data.clientId || null
    let client = null

    if (clientId) {
      client = await prisma.client.findFirst({
        where: {
          id: clientId,
          userId: req.currentUser.id,
        },
        select: {
          id: true,
          name: true,
        },
      })

      if (!client) {
        throw httpError(404, 'Cliente nao encontrado para esta clinica')
      }
    }

    const clinicId = getRequestClinicId(req)
    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'LGPD_DELETION_REVIEW_REQUESTED',
      entityType: client ? 'Client' : 'Clinic',
      entityId: client ? String(client.id) : (clinicId ? String(clinicId) : null),
      metadata: {
        reason: data.reason,
        clientName: client?.name || null,
        status: 'REVIEW_REQUIRED',
        destructiveActionExecuted: false,
      },
    })

    res.status(202).json({
      ok: true,
      status: 'REVIEW_REQUIRED',
      client,
      message: 'Solicitacao registrada. Nenhum dado clinico foi apagado automaticamente.',
    })
  }))
}

module.exports = {
  buildPrivacyDataMap,
  buildPrivacySummary,
  getClinicPrivacySnapshot,
  privacyRetentionPolicy,
  privacySecurityControls,
  registerPrivacyRoutes,
}

