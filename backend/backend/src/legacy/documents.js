const { z } = require('zod')

const documentCategorySchema = z.enum(['LEGAL', 'SANITARY', 'CLIENTS', 'WASTE'])

const clinicDocumentSchema = z.object({
  category: documentCategorySchema,
  documentType: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(1200).optional(),
  expiresAt: z.string().optional(),
  fileName: z.string().trim().min(1).max(160),
  fileMimeType: z.string().trim().max(120).optional(),
  fileDataUrl: z.string().trim().startsWith('data:'),
})

const documentCategoryLabels = {
  LEGAL: 'Legal',
  SANITARY: 'Sanitário',
  CLIENTS: 'Clientes',
  WASTE: 'Resíduos',
}

const documentRequirementCatalog = {
  LEGAL: ['Alvará sanitário', 'Alvará de funcionamento', 'CNPJ', 'Contrato social'],
  SANITARY: ['Responsável técnico', 'Manual de biossegurança', 'Licença da VISA', 'Treinamento interno'],
  CLIENTS: ['Termo de consentimento padrão', 'Política de privacidade', 'Modelo de anamnese'],
  WASTE: ['PGRSS', 'Contrato da coletora', 'Comprovante de coleta', 'Manifesto de resíduos'],
}

function getDocumentStatus(expiresAt) {
  if (!expiresAt) {
    return {
      status: 'WITHOUT_EXPIRY',
      label: 'Sem vencimento',
      daysUntilExpiry: null,
    }
  }

  const now = new Date()
  const expiresAtEndOfDay = new Date(expiresAt)

  if (Number.isNaN(expiresAtEndOfDay.getTime())) {
    return {
      status: 'WITHOUT_EXPIRY',
      label: 'Data inválida',
      daysUntilExpiry: null,
    }
  }

  expiresAtEndOfDay.setHours(23, 59, 59, 999)

  const daysUntilExpiry = Math.ceil((expiresAtEndOfDay.getTime() - now.getTime()) / 86400000)

  if (daysUntilExpiry < 0) {
    return {
      status: 'EXPIRED',
      label: 'Vencido',
      daysUntilExpiry,
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      status: 'EXPIRING',
      label: `Vence em ${daysUntilExpiry} dia(s)`,
      daysUntilExpiry,
    }
  }

  return {
    status: 'VALID',
    label: 'Em dia',
    daysUntilExpiry,
  }
}

function summarizeDocument(record) {
  if (!record) return null

  const computedStatus = getDocumentStatus(record.expiresAt)

  return {
    id: record.id,
    category: record.category,
    documentType: record.documentType,
    title: record.title,
    notes: record.notes,
    expiresAt: record.expiresAt,
    fileName: record.fileName,
    fileMimeType: record.fileMimeType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: computedStatus.status,
    statusLabel: computedStatus.label,
    daysUntilExpiry: computedStatus.daysUntilExpiry,
  }
}

function normalizeDocumentLookupValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getDocumentRequirementScore(status) {
  if (status === 'VALID' || status === 'WITHOUT_EXPIRY') return 1
  if (status === 'EXPIRING') return 0.5
  if (status === 'EXPIRED') return 0.15
  return 0
}

function findMatchingDocumentForRequirement(requirement, documents) {
  const normalizedRequirement = normalizeDocumentLookupValue(requirement)

  return documents.find(document => {
    const candidates = [document.documentType, document.title, document.fileName]
      .map(normalizeDocumentLookupValue)
      .filter(Boolean)

    return candidates.some(candidate => candidate.includes(normalizedRequirement) || normalizedRequirement.includes(candidate))
  }) || null
}

function getDocumentRequirementLabel(status, matchedDocument) {
  if (!matchedDocument) return 'Faltando'
  if (status === 'EXPIRING') return matchedDocument.statusLabel
  if (status === 'EXPIRED') return 'Vencido'
  if (status === 'WITHOUT_EXPIRY') return 'Sem vencimento'
  return 'Em dia'
}

function buildDocumentDashboard(records = []) {
  const summarized = (Array.isArray(records) ? records : []).map(summarizeDocument).filter(Boolean)
  const alerts = summarized
    .filter(document => document.status === 'EXPIRING' || document.status === 'EXPIRED')
    .sort((left, right) => {
      const leftScore = left.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER
      const rightScore = right.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER
      return leftScore - rightScore
    })
    .slice(0, 5)

  const categories = Object.entries(documentRequirementCatalog).map(([category, requirements]) => {
    const categoryDocuments = summarized.filter(document => document.category === category)
    const requirementStatuses = requirements.map(requirement => {
      const matchedDocument = findMatchingDocumentForRequirement(requirement, categoryDocuments)
      const status = matchedDocument?.status || 'MISSING'

      return {
        requirement,
        status,
        statusLabel: getDocumentRequirementLabel(status, matchedDocument),
        matchedDocumentId: matchedDocument?.id || null,
        matchedTitle: matchedDocument?.title || null,
        daysUntilExpiry: matchedDocument?.daysUntilExpiry ?? null,
      }
    })

    const scoreValue = requirementStatuses.reduce((total, item) => total + getDocumentRequirementScore(item.status), 0)
    const requiredCount = requirements.length
    const fulfilledCount = requirementStatuses.filter(item => item.status !== 'MISSING').length
    const validCount = requirementStatuses.filter(item => item.status === 'VALID' || item.status === 'WITHOUT_EXPIRY').length
    const criticalCount = requirementStatuses.filter(item => item.status === 'EXPIRING' || item.status === 'EXPIRED' || item.status === 'MISSING').length
    const missing = requirementStatuses.filter(item => item.status === 'MISSING').map(item => item.requirement)

    return {
      category,
      categoryLabel: documentCategoryLabels[category] || category,
      total: categoryDocuments.length,
      requiredCount,
      fulfilledCount,
      validCount,
      criticalCount,
      missing,
      score: requiredCount ? Math.round((scoreValue / requiredCount) * 100) : 100,
      requirementStatuses,
    }
  })

  const totalRequired = categories.reduce((total, category) => total + category.requiredCount, 0)
  const totalCovered = categories.reduce((total, category) => total + category.fulfilledCount, 0)
  const totalScoreValue = categories.reduce((total, category) => total + ((category.score / 100) * category.requiredCount), 0)
  const missingDocuments = categories.flatMap(category => category.missing.map(requirement => ({
    id: `${category.category}:${requirement}`,
    category: category.category,
    categoryLabel: category.categoryLabel,
    requirement,
  })))

  const expiringIn7Days = summarized.filter(document => document.status === 'EXPIRING' && document.daysUntilExpiry !== null && document.daysUntilExpiry <= 7).length
  const expiringIn15Days = summarized.filter(document => document.status === 'EXPIRING' && document.daysUntilExpiry !== null && document.daysUntilExpiry <= 15).length
  const expiringIn30Days = summarized.filter(document => document.status === 'EXPIRING' && document.daysUntilExpiry !== null && document.daysUntilExpiry <= 30).length
  const updateTimes = summarized
    .map(document => new Date(document.updatedAt).getTime())
    .filter(time => Number.isFinite(time))
  const lastUpdatedAt = updateTimes.length ? Math.max(...updateTimes) : null

  return {
    total: summarized.length,
    valid: summarized.filter(document => document.status === 'VALID' || document.status === 'WITHOUT_EXPIRY').length,
    expiring: summarized.filter(document => document.status === 'EXPIRING').length,
    expired: summarized.filter(document => document.status === 'EXPIRED').length,
    alerts,
    complianceScore: totalRequired ? Math.round((totalScoreValue / totalRequired) * 100) : 100,
    recommendedRequiredCount: totalRequired,
    recommendedCoveredCount: totalCovered,
    missingCount: missingDocuments.length,
    missingDocuments,
    categories: categories.map(category => ({
      category: category.category,
      categoryLabel: category.categoryLabel,
      total: category.total,
      requiredCount: category.requiredCount,
      fulfilledCount: category.fulfilledCount,
      validCount: category.validCount,
      criticalCount: category.criticalCount,
      missing: category.missing,
      score: category.score,
    })),
    windows: {
      next7Days: expiringIn7Days,
      next15Days: expiringIn15Days,
      next30Days: expiringIn30Days,
    },
    lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null,
  }
}

function normalizeDocumentData(data, parseDateOnly) {
  const normalized = {}

  if ('category' in data) normalized.category = data.category
  if ('documentType' in data) normalized.documentType = data.documentType.trim()
  if ('title' in data) normalized.title = data.title.trim()
  if ('notes' in data) normalized.notes = data.notes?.trim() || null
  if ('expiresAt' in data) normalized.expiresAt = data.expiresAt ? parseDateOnly(data.expiresAt, 'expiresAt') : null
  if ('fileName' in data) normalized.fileName = data.fileName.trim()
  if ('fileMimeType' in data) normalized.fileMimeType = data.fileMimeType?.trim() || null
  if ('fileDataUrl' in data) normalized.fileDataUrl = data.fileDataUrl

  return normalized
}

function serializeDocumentAuditDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString()
}

function buildDocumentAuditMetadata(record, overrides = {}) {
  const summary = summarizeDocument(record) || {}

  return {
    title: summary.title || null,
    documentType: summary.documentType || null,
    category: summary.category || null,
    categoryLabel: summary.category ? documentCategoryLabels[summary.category] || summary.category : null,
    fileName: summary.fileName || null,
    fileMimeType: summary.fileMimeType || null,
    expiresAt: serializeDocumentAuditDate(summary.expiresAt),
    status: summary.status || null,
    statusLabel: summary.statusLabel || null,
    daysUntilExpiry: summary.daysUntilExpiry ?? null,
    ...overrides,
  }
}

function getScopedDocumentUserId(req) {
  return req.currentUser?.id || req.user?.id
}

function getScopedDocumentClinicId(req) {
  return req.currentUser?.ownedClinic?.id || null
}

async function ensureDocumentOwnership(prisma, userId, documentId) {
  return prisma.clinicDocument.findFirstOrThrow({
    where: { id: documentId, userId },
  })
}

function registerDocumentRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  parseId,
  parseDateOnly,
  createAuditLogFromRequest = async () => null,
}) {
  if (!app || !prisma || !authMiddleware || !handle || !parseId || !parseDateOnly) {
    throw new Error('registerDocumentRoutes requer app, prisma, authMiddleware, handle, parseId e parseDateOnly')
  }

  app.get('/documents/summary', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const records = await prisma.clinicDocument.findMany({
      where: { userId },
      select: {
        id: true,
        category: true,
        documentType: true,
        title: true,
        notes: true,
        expiresAt: true,
        fileName: true,
        fileMimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json(buildDocumentDashboard(records))
  }))

  app.get('/documents', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const category = req.query.category ? documentCategorySchema.parse(String(req.query.category)) : null

    const records = await prisma.clinicDocument.findMany({
      where: {
        userId,
        ...(category ? { category } : {}),
      },
      orderBy: [
        { expiresAt: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    res.json(records.map(summarizeDocument))
  }))

  app.get('/documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const document = await ensureDocumentOwnership(prisma, userId, documentId)

    await createAuditLogFromRequest(req, {
      clinicId: getScopedDocumentClinicId(req),
      action: 'CLINIC_DOCUMENT_VIEW',
      entityType: 'ClinicDocument',
      entityId: documentId,
      metadata: buildDocumentAuditMetadata(document),
    })

    res.json({
      ...summarizeDocument(document),
      fileDataUrl: document.fileDataUrl,
    })
  }))

  app.post('/documents', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const data = clinicDocumentSchema.parse(req.body)
    const document = await prisma.clinicDocument.create({
      data: {
        ...normalizeDocumentData(data, parseDateOnly),
        userId,
      },
    })
    const summary = summarizeDocument(document)

    await createAuditLogFromRequest(req, {
      clinicId: getScopedDocumentClinicId(req),
      action: 'CLINIC_DOCUMENT_CREATE',
      entityType: 'ClinicDocument',
      entityId: document.id,
      metadata: buildDocumentAuditMetadata(document),
    })

    res.status(201).json(summary)
  }))

  app.put('/documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const data = clinicDocumentSchema.partial().parse(req.body)

    const previousDocument = await ensureDocumentOwnership(prisma, userId, documentId)

    const document = await prisma.clinicDocument.update({
      where: { id: documentId },
      data: normalizeDocumentData(data, parseDateOnly),
    })
    const summary = summarizeDocument(document)

    await createAuditLogFromRequest(req, {
      clinicId: getScopedDocumentClinicId(req),
      action: 'CLINIC_DOCUMENT_UPDATE',
      entityType: 'ClinicDocument',
      entityId: documentId,
      metadata: buildDocumentAuditMetadata(document, {
        previous: buildDocumentAuditMetadata(previousDocument),
      }),
    })

    res.json(summary)
  }))

  app.delete('/documents/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedDocumentUserId(req)
    const documentId = parseId(req.params.id, 'documentId')
    const previousDocument = await ensureDocumentOwnership(prisma, userId, documentId)

    await prisma.clinicDocument.deleteMany({
      where: { id: documentId, userId },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getScopedDocumentClinicId(req),
      action: 'CLINIC_DOCUMENT_DELETE',
      entityType: 'ClinicDocument',
      entityId: documentId,
      metadata: buildDocumentAuditMetadata(previousDocument, {
        removedFromActiveBase: true,
      }),
    })

    res.json({ ok: true })
  }))
}

module.exports = {
  buildDocumentDashboard,
  buildDocumentAuditMetadata,
  clinicDocumentSchema,
  documentCategorySchema,
  getDocumentStatus,
  normalizeDocumentData,
  registerDocumentRoutes,
  summarizeDocument,
}