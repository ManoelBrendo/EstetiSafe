const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')

const healthRouter = express.Router()

healthRouter.get('/', asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`

  res.json({
    status: 'ok',
    service: "L'Appui Future API Blueprint",
  })
}))

module.exports = {
  healthRouter,
}
