const express = require('express')
const { asyncHandler, parsePositiveInt, httpError } = require('../lib/http')
const { ensureClientOwnership } = require('../lib/medical-records')
const { ensureServiceOwnership } = require('../lib/protocols')

function createPdfRouter(context) {
  const router = express.Router()

  router.use(context.auth.authMiddleware)
  router.use(context.auth.requireScopedClinicUser)

  router.get('/medical-records/by-client/:clientId', asyncHandler(async (req, res) => {
    if (!context.legacyPdf?.sendPdfDocument || !context.legacyPdf?.renderClientMedicalRecordPdf || !context.legacyPdf?.sanitizeFileName) {
      throw httpError(501, 'Geracao de PDF ainda nao disponivel na API v2.')
    }

    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    await ensureClientOwnership(context.prisma, req.currentUser.id, clientId)

    const client = await context.prisma.client.findFirstOrThrow({
      where: { id: clientId, userId: req.currentUser.id },
      include: {
        appointments: {
          include: { service: true, professional: true, payment: true },
          orderBy: { startAt: 'desc' },
          take: 12,
        },
        anamneses: {
          orderBy: { filledAt: 'desc' },
          take: 1,
        },
        consentRecords: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    const filename = `${context.legacyPdf.sanitizeFileName(`prontuario-${client.name}`, 'prontuario-clinico')}.pdf`
    context.legacyPdf.sendPdfDocument(res, filename, doc => {
      context.legacyPdf.renderClientMedicalRecordPdf(doc, {
        clinicName: req.currentUser?.clinicName,
        client,
      })
    })
  }))

  router.get('/service-pops/by-service/:serviceId', asyncHandler(async (req, res) => {
    if (
      !context.legacyPdf?.sendPdfDocument
      || !context.legacyPdf?.renderServicePopPdf
      || !context.legacyPdf?.sanitizeFileName
    ) {
      throw httpError(501, 'PDF de POP ainda nao disponivel na API v2.')
    }

    const serviceId = parsePositiveInt(req.params.serviceId, 'serviceId')
    const service = await ensureServiceOwnership(context.prisma, req.currentUser.id, serviceId)

    let pop = service.servicePop
    if (!pop && context.legacyPdf?.ensureServicePopForService) {
      pop = await context.legacyPdf.ensureServicePopForService({
        userId: req.currentUser.id,
        clinicName: req.currentUser.clinicName,
        service,
      })
    }

    if (!pop) {
      throw httpError(404, 'POP ainda nao disponivel para este servico.')
    }

    const filename = `${context.legacyPdf.sanitizeFileName(pop.title || `pop-${service.name}`, 'pop')}.pdf`
    context.legacyPdf.sendPdfDocument(res, filename, doc => {
      context.legacyPdf.renderServicePopPdf(doc, {
        clinicName: req.currentUser?.clinicName,
        service,
        pop,
      })
    })
  }))

  return router
}

module.exports = {
  createPdfRouter,
}
