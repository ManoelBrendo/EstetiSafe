const express = require('express')
const { documentCreateSchema } = require('../schemas')
const { asyncHandler, parseUuid, httpError } = require('../lib/http')
const { createFutureAuditLog } = require('../lib/audit')
const { buildPdfDocument } = require('../lib/serializers')
const { getOrCreateMedicalRecordForClient } = require('../lib/medical-records')

function createDocumentsRouter(context) {
  const router = express.Router()

  router.use(context.authMiddleware)
  router.use(context.requireScopedClinicUser)

  router.get('/by-client/:clientId', asyncHandler(async (req, res) => {
    const clientId = parseUuid(req.params.clientId, 'clientId')
    const documents = await context.prisma.pdfDocument.findMany({
      where: {
        clientId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json(documents.map(buildPdfDocument))
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const payload = documentCreateSchema.parse(req.body)
    const medicalRecord = payload.medicalRecordId
      ? await context.prisma.medicalRecord.findUnique({ where: { id: payload.medicalRecordId } })
      : await getOrCreateMedicalRecordForClient(context.prisma, payload.clientId)

    if (!medicalRecord) {
      throw httpError(404, 'Prontuário não encontrado para o documento')
    }

    const document = await context.prisma.pdfDocument.create({
      data: {
        clientId: payload.clientId,
        medicalRecordId: medicalRecord.id,
        protocolId: payload.protocolId || null,
        fileName: payload.fileName,
        fileUrl: payload.fileUrl,
        documentType: payload.documentType,
      },
    })

    await createFutureAuditLog(context.prisma, req, {
      actionType: 'generate_pdf',
      entityType: 'PdfDocument',
      entityId: document.id,
      newData: buildPdfDocument(document),
    })

    res.status(201).json(buildPdfDocument(document))
  }))

  return router
}

module.exports = {
  createDocumentsRouter,
}
