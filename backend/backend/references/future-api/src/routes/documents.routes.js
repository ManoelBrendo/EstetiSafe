const express = require('express')
const { prisma } = require('../lib/prisma')
const { asyncHandler } = require('../lib/async-handler')
const { recordAudit } = require('../lib/audit-log')
const { httpError, pickPagination, sendPaginated } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { idParamSchema, paginationQuerySchema, pdfDocumentCreateSchema } = require('../schemas')

const documentsRouter = express.Router()
const documentInclude = {
  client: true,
  medicalRecord: true,
  protocol: true,
}

documentsRouter.get('/', requireAuth, validate({ query: paginationQuerySchema }), asyncHandler(async (req, res) => {
  const pagination = pickPagination(req.query)
  const [items, total] = await Promise.all([
    prisma.pdfDocument.findMany({
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { generatedAt: 'desc' },
      include: documentInclude,
    }),
    prisma.pdfDocument.count(),
  ])

  return sendPaginated(res, items, total, pagination)
}))

documentsRouter.post('/', requireAuth, validate({ body: pdfDocumentCreateSchema }), asyncHandler(async (req, res) => {
  const document = await prisma.$transaction(async tx => {
    const created = await tx.pdfDocument.create({
      data: {
        clientId: req.body.clientId,
        medicalRecordId: req.body.medicalRecordId,
        protocolId: req.body.protocolId ?? null,
        fileName: req.body.fileName,
        fileUrl: req.body.fileUrl,
        documentType: req.body.documentType,
      },
      include: documentInclude,
    })

    await recordAudit(tx, {
      entityType: 'PdfDocument',
      entityId: created.id,
      actionType: 'generate_pdf',
      userName: req.auth?.email || null,
      newData: created,
    })

    return created
  })

  res.status(201).json(document)
}))

documentsRouter.get('/:id', requireAuth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const document = await prisma.pdfDocument.findUnique({
    where: { id: req.params.id },
    include: documentInclude,
  })

  if (!document) {
    throw httpError(404, 'Documento PDF nao encontrado.')
  }

  res.json(document)
}))

module.exports = {
  documentsRouter,
}
