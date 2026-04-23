const express = require('express')
const { clientCreateSchema, clientUpdateSchema } = require('../schemas')
const { asyncHandler, pickPagination, buildPaginated, parsePositiveInt, parseOptionalDate, sanitizeCpf, compactObject } = require('../lib/http')
const { createAuditLog } = require('../lib/audit')
const {
  ensureClientOwnership,
  serializeClientListItem,
  serializeClientDetail,
  buildClientOverview,
  buildClientTimeline,
  buildMedicalRecord,
} = require('../lib/medical-records')

function normalizeClientPayload(payload) {
  return compactObject({
    name: payload.fullName?.trim() || payload.name?.trim() || undefined,
    email: payload.email?.trim() || undefined,
    phone: payload.phone?.trim() || undefined,
    birthDate: parseOptionalDate(payload.birthDate, 'birthDate') || undefined,
    cpf: sanitizeCpf(payload.cpf) || undefined,
    sex: payload.sex?.trim() || undefined,
    maritalStatus: payload.maritalStatus?.trim() || undefined,
    profession: payload.profession?.trim() || undefined,
    addressFull: payload.addressFull?.trim() || undefined,
    notes: payload.notes?.trim() || undefined,
  })
}

function createClientsRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/', asyncHandler(async (req, res) => {
    const pagination = pickPagination(req.query)
    const search = String(req.query.search || '').trim()
    const where = {
      userId: req.currentUser.id,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { cpf: { contains: search } },
        ],
      } : {}),
    }

    const [items, total] = await Promise.all([
      context.prisma.client.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          anamneses: { orderBy: { filledAt: 'desc' }, take: 1 },
          consentRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
          appointments: {
            orderBy: { startAt: 'desc' },
            take: 1,
            include: {
              service: true,
              professional: true,
              payment: true,
            },
          },
          _count: {
            select: {
              appointments: true,
              anamneses: true,
              consentRecords: true,
            },
          },
        },
      }),
      context.prisma.client.count({ where }),
    ])

    res.json(buildPaginated(items.map(serializeClientListItem), total, pagination))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = clientCreateSchema.parse(req.body)
    const created = await context.prisma.client.create({
      data: {
        ...normalizeClientPayload(payload),
        userId: req.currentUser.id,
      },
      include: {
        anamneses: true,
        consentRecords: true,
        appointments: {
          include: { service: true, professional: true, payment: true },
        },
      },
    })

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_CLIENT_CREATE',
      entityType: 'Client',
      entityId: created.id,
      metadata: { path: '/api/v2/clients' },
    })

    res.status(201).json(serializeClientDetail(created))
  }))

  router.get('/:id', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json(serializeClientDetail(client))
  }))

  router.patch('/:id', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const payload = clientUpdateSchema.parse(req.body)
    await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)

    const updated = await context.prisma.client.update({
      where: { id: clientId },
      data: normalizeClientPayload(payload),
      include: {
        anamneses: { orderBy: { filledAt: 'desc' } },
        consentRecords: { orderBy: { createdAt: 'desc' }, include: { professional: true } },
        appointments: {
          orderBy: { startAt: 'desc' },
          include: { service: true, professional: true, payment: true },
        },
      },
    })

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_CLIENT_UPDATE',
      entityType: 'Client',
      entityId: updated.id,
      metadata: { path: `/api/v2/clients/${updated.id}` },
    })

    res.json(serializeClientDetail(updated))
  }))

  router.get('/:id/overview', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json(buildClientOverview(client))
  }))

  router.get('/:id/timeline', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json({
      clientId: client.id,
      items: buildClientTimeline(client),
    })
  }))

  router.get('/:id/medical-record', asyncHandler(async (req, res) => {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)
    res.json(buildMedicalRecord(client))
  }))

  return router
}

module.exports = {
  createClientsRouter,
}
