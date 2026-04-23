const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { compactObject, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth, requireRole } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { auditLogQuerySchema } = require('../schemas')

const auditRouter = express.Router()

auditRouter.get('/', requireAuth, requireRole('support', 'admin'), validate({ query: auditLogQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const where = compactObject({
    entityType: req.query.entityType,
    entityId: req.query.entityId,
    actionType: req.query.actionType,
  })

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ])

  return sendPaginated(res, items, total, pagination)
}))

module.exports = {
  auditRouter,
}
