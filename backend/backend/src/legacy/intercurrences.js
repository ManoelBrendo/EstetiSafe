const { z } = require('zod')
const {
  parseId,
  httpError,
  getAuditActorData,
  createAuditLogFromRequest,
  getRequestClinicId,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

const intercurrenceBaseSchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  procedureName: z.string().trim().min(2).max(160).optional(),
  occurredDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  occurredTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  description: z.string().trim().min(10).max(6000).optional(),
  conduct: z.string().trim().min(5).max(4000).optional(),
  notes: z.string().trim().max(2000).optional(),
  professionalId: z.coerce.number().int().positive().nullable().optional(),
  professionalName: z.string().trim().min(2).max(160).optional(),
})

const intercurrenceCreateSchema = intercurrenceBaseSchema.extend({
  clientId: z.coerce.number().int().positive(),
  procedureName: z.string().trim().min(2).max(160),
  occurredDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurredTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  description: z.string().trim().min(10).max(6000),
  conduct: z.string().trim().min(5).max(4000),
}).superRefine((value, ctx) => {
  if (!value.professionalId && !value.professionalName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe a profissional responsável', path: ['professionalName'] })
  }
})

const intercurrenceUpdateSchema = intercurrenceBaseSchema.extend({
  editReason: z.string().trim().min(3).max(600),
}).superRefine((value, ctx) => {
  if (Object.keys(value).filter(key => key !== 'editReason').length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe ao menos um campo para editar', path: ['editReason'] })
  }
})

const intercurrenceInclude = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true, specialty: true } },
  _count: { select: { edits: true } },
}

function buildIntercurrenceOccurredAt(dateValue, timeValue, fallbackDate, httpError) {
  const fallback = fallbackDate ? new Date(fallbackDate) : null
  const datePart = dateValue || (fallback ? fallback.toISOString().slice(0, 10) : '')
  const timePart = timeValue || (fallback ? fallback.toISOString().slice(11, 16) : '')
  const parsed = new Date(`${datePart}T${timePart}:00`)

  if (!datePart || !timePart || Number.isNaN(parsed.getTime())) {
    throw httpError(422, 'Data ou hora da intercorrência inválida.')
  }

  return parsed
}

function serializeIntercurrence(record) {
  if (!record) return null
  const edits = Array.isArray(record.edits) ? record.edits : []

  return {
    id: record.id,
    clientId: record.clientId,
    serviceId: record.serviceId,
    professionalId: record.professionalId,
    procedureName: record.procedureName,
    occurredAt: record.occurredAt,
    description: record.description,
    conduct: record.conduct,
    notes: record.notes,
    professionalName: record.professionalName,
    createdByUserId: record.createdByUserId,
    createdByEmail: record.createdByEmail,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    client: record.client ? { id: record.client.id, name: record.client.name, phone: record.client.phone } : null,
    service: record.service ? { id: record.service.id, name: record.service.name } : null,
    professional: record.professional ? { id: record.professional.id, name: record.professional.name, specialty: record.professional.specialty } : null,
    editsCount: record._count?.edits ?? edits.length,
    edits: edits.map(edit => ({
      id: edit.id,
      editedByUserId: edit.editedByUserId,
      editedByEmail: edit.editedByEmail,
      editReason: edit.editReason,
      changes: edit.changes,
      createdAt: edit.createdAt,
    })),
  }
}

function buildIntercurrenceSnapshot(record) {
  return {
    clientId: record.clientId,
    serviceId: record.serviceId,
    professionalId: record.professionalId,
    procedureName: record.procedureName,
    occurredAt: record.occurredAt?.toISOString?.() || record.occurredAt,
    description: record.description,
    conduct: record.conduct,
    notes: record.notes || null,
    professionalName: record.professionalName,
  }
}

function buildIntercurrenceChanges(before, after) {
  return Object.keys(after).reduce((changes, key) => {
    const beforeValue = before[key] === undefined ? null : before[key]
    const afterValue = after[key] === undefined ? null : after[key]

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = { from: beforeValue, to: afterValue }
    }

    return changes
  }, {})
}

async function resolveIntercurrenceRelations({ prisma, userId, data, current = {}, httpError }) {
  const clientId = data.clientId ?? current.clientId
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, userId },
    select: { id: true, name: true },
  })

  let service = null
  const serviceId = Object.prototype.hasOwnProperty.call(data, 'serviceId') ? data.serviceId : current.serviceId
  if (serviceId) {
    service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, userId },
      select: { id: true, name: true },
    })
  }

  let professional = null
  const professionalId = Object.prototype.hasOwnProperty.call(data, 'professionalId') ? data.professionalId : current.professionalId
  if (professionalId) {
    professional = await prisma.professional.findFirstOrThrow({
      where: { id: professionalId, userId },
      select: { id: true, name: true, specialty: true },
    })
  }

  const procedureName = data.procedureName?.trim() || service?.name || current.procedureName
  const professionalName = data.professionalName?.trim() || professional?.name || current.professionalName

  if (!procedureName) throw httpError(422, 'Informe o procedimento relacionado.')
  if (!professionalName) throw httpError(422, 'Informe a profissional responsável.')

  return {
    client,
    service,
    professional,
    data: {
      clientId: client.id,
      serviceId: service?.id || null,
      professionalId: professional?.id || null,
      procedureName,
      professionalName,
    },
  }
}

function getScopedIntercurrenceUserId(req) {
  return req.currentUser?.id || req.user?.id
}

function buildIntercurrenceWhere({ req, parseId, userId = getScopedIntercurrenceUserId(req) }) {
  const search = String(req.query.search || '').trim()
  const procedure = String(req.query.procedure || '').trim()
  const where = { userId }

  if (req.query.clientId) where.clientId = parseId(req.query.clientId, 'clientId')
  if (req.query.professionalId) where.professionalId = parseId(req.query.professionalId, 'professionalId')
  if (req.query.serviceId) where.serviceId = parseId(req.query.serviceId, 'serviceId')

  if (req.query.dateFrom || req.query.dateTo) {
    where.occurredAt = {}
    if (req.query.dateFrom) where.occurredAt.gte = new Date(`${String(req.query.dateFrom)}T00:00:00`)
    if (req.query.dateTo) where.occurredAt.lte = new Date(`${String(req.query.dateTo)}T23:59:59.999`)
  }

  if (procedure) {
    where.procedureName = { contains: procedure, mode: 'insensitive' }
  }

  if (search) {
    where.OR = [
      { procedureName: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { conduct: { contains: search, mode: 'insensitive' } },
      { professionalName: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  return where
}

function registerIntercurrenceRoutes(options) {
  const {
    app,
    prisma,
    authMiddleware = require('./lib/middlewares').authMiddleware,
    handle = require('./lib/middlewares').handle,
    parseId = require('./lib/helpers').parseId,
    httpError = require('./lib/helpers').httpError,
    getAuditActorData = require('./lib/helpers').getAuditActorData,
    createAuditLogFromRequest = require('./lib/helpers').createAuditLogFromRequest,
  } = options

  app.get('/intercurrences', authMiddleware, handle(async (req, res) => {
    const userId = getScopedIntercurrenceUserId(req)
    const where = buildIntercurrenceWhere({ req, parseId, userId })
    const [items, total] = await Promise.all([
      prisma.clinicalIntercurrence.findMany({
        where,
        include: intercurrenceInclude,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 120,
      }),
      prisma.clinicalIntercurrence.count({ where }),
    ])

    res.json({ items: items.map(serializeIntercurrence), total })
  }))

  app.get('/intercurrences/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedIntercurrenceUserId(req)
    const id = parseId(req.params.id, 'intercurrenceId')
    const record = await prisma.clinicalIntercurrence.findFirstOrThrow({
      where: { id, userId },
      include: {
        ...intercurrenceInclude,
        edits: { orderBy: { createdAt: 'desc' } },
      },
    })

    res.json(serializeIntercurrence(record))
  }))

  app.post('/intercurrences', authMiddleware, handle(async (req, res) => {
    const userId = getScopedIntercurrenceUserId(req)
    const data = intercurrenceCreateSchema.parse(req.body)
    const relations = await resolveIntercurrenceRelations({ prisma, userId, data, httpError })
    const occurredAt = buildIntercurrenceOccurredAt(data.occurredDate, data.occurredTime, null, httpError)
    const actor = getAuditActorData(req)

    const record = await prisma.clinicalIntercurrence.create({
      data: {
        ...relations.data,
        userId,
        occurredAt,
        description: data.description.trim(),
        conduct: data.conduct.trim(),
        notes: data.notes?.trim() || null,
        createdByUserId: actor.actorUserId,
        createdByEmail: actor.actorEmail,
      },
      include: intercurrenceInclude,
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'INTERCURRENCE_CREATE',
      entityType: 'ClinicalIntercurrence',
      entityId: record.id,
      metadata: {
        clientName: relations.client.name,
        procedureName: record.procedureName,
        professionalName: record.professionalName,
        occurredAt: record.occurredAt,
      },
    })

    res.status(201).json(serializeIntercurrence(record))
  }))

  app.put('/intercurrences/:id', authMiddleware, handle(async (req, res) => {
    const userId = getScopedIntercurrenceUserId(req)
    const id = parseId(req.params.id, 'intercurrenceId')
    const data = intercurrenceUpdateSchema.parse(req.body)
    const existing = await prisma.clinicalIntercurrence.findFirstOrThrow({
      where: { id, userId },
      include: intercurrenceInclude,
    })

    const relations = await resolveIntercurrenceRelations({ prisma, userId, data, current: existing, httpError })
    const updateData = { ...relations.data }

    if (data.occurredDate || data.occurredTime) {
      updateData.occurredAt = buildIntercurrenceOccurredAt(data.occurredDate, data.occurredTime, existing.occurredAt, httpError)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) updateData.description = data.description.trim()
    if (Object.prototype.hasOwnProperty.call(data, 'conduct')) updateData.conduct = data.conduct.trim()
    if (Object.prototype.hasOwnProperty.call(data, 'notes')) updateData.notes = data.notes?.trim() || null

    const beforeSnapshot = buildIntercurrenceSnapshot(existing)
    const afterSnapshotPreview = buildIntercurrenceSnapshot({ ...existing, ...updateData })
    const changes = buildIntercurrenceChanges(beforeSnapshot, afterSnapshotPreview)

    if (!Object.keys(changes).length) {
      throw httpError(422, 'Nenhuma alteração real foi identificada.')
    }

    const actor = getAuditActorData(req)
    const updated = await prisma.$transaction(async tx => {
      const nextRecord = await tx.clinicalIntercurrence.update({
        where: { id },
        data: updateData,
        include: intercurrenceInclude,
      })

      await tx.clinicalIntercurrenceEdit.create({
        data: {
          intercurrenceId: id,
          editedByUserId: actor.actorUserId,
          editedByEmail: actor.actorEmail,
          editReason: data.editReason.trim(),
          changes,
          snapshotBefore: beforeSnapshot,
          snapshotAfter: buildIntercurrenceSnapshot(nextRecord),
        },
      })

      return nextRecord
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'INTERCURRENCE_UPDATE',
      entityType: 'ClinicalIntercurrence',
      entityId: updated.id,
      metadata: {
        clientName: relations.client.name,
        procedureName: updated.procedureName,
        professionalName: updated.professionalName,
        changedFields: Object.keys(changes),
      },
    })

    res.json(serializeIntercurrence(updated))
  }))
}

module.exports = {
  buildIntercurrenceChanges,
  buildIntercurrenceSnapshot,
  buildIntercurrenceWhere,
  getScopedIntercurrenceUserId,
  registerIntercurrenceRoutes,
  serializeIntercurrence,
}
