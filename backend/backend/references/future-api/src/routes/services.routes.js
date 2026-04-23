const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { compactObject, httpError, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { idParamSchema, paginationQuerySchema, serviceCreateSchema, serviceUpdateSchema } = require('../schemas')

const servicesRouter = express.Router()

servicesRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.service.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.service.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

servicesRouter.post('/', requireAuth, validate({ body: serviceCreateSchema }), asyncHandler(async (req, res) => {
  const service = await prisma.$transaction(async tx => {
    const created = await tx.service.create({
      data: compactObject({
        name: req.body.name,
        description: req.body.description ?? null,
        defaultSessions: req.body.defaultSessions || 1,
        active: req.body.active ?? true,
      }),
    })

    await recordAudit(tx, {
      entityType: 'Service',
      entityId: created.id,
      actionType: 'create',
      userName: req.auth?.email || null,
      newData: created,
    })

    return created
  })

  res.status(201).json(service)
}))

servicesRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const service = await prisma.service.findUnique({ where: { id: req.params.id } })
  if (!service) {
    throw httpError(404, 'Servico nao encontrado.')
  }

  res.json(service)
}))

servicesRouter.patch('/:id', requireAuth, validate({ params: idParamSchema, body: serviceUpdateSchema }), asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.service.findUnique({ where: { id: req.params.id } })
    if (!current) {
      throw httpError(404, 'Servico nao encontrado.')
    }

    const next = await tx.service.update({
      where: { id: current.id },
      data: compactObject({
        name: req.body.name,
        description: req.body.description,
        defaultSessions: req.body.defaultSessions,
        active: req.body.active,
      }),
    })

    await recordAudit(tx, {
      entityType: 'Service',
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

servicesRouter.delete('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  await prisma.$transaction(async tx => {
    const current = await tx.service.findUnique({ where: { id: req.params.id } })
    if (!current) {
      throw httpError(404, 'Servico nao encontrado.')
    }

    await tx.service.delete({ where: { id: current.id } })
    await recordAudit(tx, {
      entityType: 'Service',
      entityId: current.id,
      actionType: 'delete',
      userName: req.auth?.email || null,
      oldData: current,
    })
  })

  res.status(204).send()
}))

module.exports = {
  servicesRouter,
}
