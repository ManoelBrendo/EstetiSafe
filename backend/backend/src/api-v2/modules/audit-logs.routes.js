const express = require('express')
const { asyncHandler, pickPagination, buildPaginated, parseOptionalDate } = require('../lib/http')
const { serializeAuditLog, buildAuditLogSummary } = require('../lib/audit-logs')

function cleanString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function buildAuditScope(req) {
  const clinicId = req.currentUser?.ownedClinic?.id || null

  if (clinicId) {
    return {
      OR: [
        { clinicId },
        { clinicId: null, actorUserId: req.currentUser.id },
      ],
    }
  }

  return { actorUserId: req.currentUser.id }
}

function normalizeSearchTerm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildSearchAliasFilters(search) {
  const normalized = normalizeSearchTerm(search)
  const filters = []

  if (normalized.includes('suporte')) {
    filters.push({ action: { contains: 'SUPPORT', mode: 'insensitive' } })
    filters.push({ actorRole: 'SUPPORT' })
  }

  if (normalized.includes('prontuario') || normalized.includes('anamnese') || normalized.includes('protocolo')) {
    filters.push({ action: { contains: 'MEDICAL', mode: 'insensitive' } })
    filters.push({ action: { contains: 'ANAMNESIS', mode: 'insensitive' } })
    filters.push({ action: { contains: 'PROTOCOL', mode: 'insensitive' } })
  }

  if (normalized.includes('consentimento') || normalized.includes('termo')) {
    filters.push({ action: { contains: 'CONSENT', mode: 'insensitive' } })
  }

  if (
    normalized.includes('financeiro')
    || normalized.includes('pagamento')
    || normalized.includes('cobranca')
    || normalized.includes('assinatura')
  ) {
    filters.push({ action: { contains: 'BILLING', mode: 'insensitive' } })
    filters.push({ action: { contains: 'PAYMENT', mode: 'insensitive' } })
    filters.push({ action: { contains: 'GATEWAY', mode: 'insensitive' } })
  }

  if (normalized.includes('cliente')) {
    filters.push({ action: { contains: 'CLIENT', mode: 'insensitive' } })
  }

  if (normalized.includes('pdf')) {
    filters.push({ action: { contains: 'PDF', mode: 'insensitive' } })
  }

  return filters
}

function buildSearchFilter(search) {
  if (!search) return null

  return {
    OR: [
      { action: { contains: search, mode: 'insensitive' } },
      { entityType: { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search, mode: 'insensitive' } },
      { actorEmail: { contains: search, mode: 'insensitive' } },
      ...buildSearchAliasFilters(search),
    ],
  }
}

function createAuditLogsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/', asyncHandler(async (req, res) => {
    const pagination = pickPagination(req.query)
    const action = cleanString(req.query.action)
    const entityType = cleanString(req.query.entityType)
    const actorRole = cleanString(req.query.actorRole)
    const search = cleanString(req.query.search)
    const from = parseOptionalDate(req.query.from, 'from')
    const to = parseOptionalDate(req.query.to, 'to')

    const andFilters = [buildAuditScope(req)]

    if (action) andFilters.push({ action })
    if (entityType) andFilters.push({ entityType })
    if (actorRole) andFilters.push({ actorRole })

    const searchFilter = buildSearchFilter(search)
    if (searchFilter) andFilters.push(searchFilter)

    if (from || to) {
      andFilters.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      })
    }

    const where = { AND: andFilters }

    const [logs, total, actionGroups] = await Promise.all([
      context.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      context.prisma.auditLog.count({ where }),
      context.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
      }),
    ])

    const serializedLogs = logs.map(serializeAuditLog)

    res.json({
      ...buildPaginated(serializedLogs, total, pagination),
      logs: serializedLogs,
      summary: buildAuditLogSummary(actionGroups, total),
      filters: {
        action: action || null,
        entityType: entityType || null,
        actorRole: actorRole || null,
        search: search || null,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
    })
  }))

  router.get('/verify', asyncHandler(async (req, res) => {
    if (req.currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem verificar a integridade da cadeia de logs.' })
    }

    const { verifyAuditLogChain } = require('../lib/auditChaining')
    const report = await verifyAuditLogChain(context.prisma)
    res.json(report)
  }))

  return router
}

module.exports = {
  createAuditLogsRouter,
  buildAuditScope,
  buildSearchFilter,
}

