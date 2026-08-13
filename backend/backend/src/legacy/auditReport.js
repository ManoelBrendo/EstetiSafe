const { getDocumentStatus } = require('./documents')
const {
  sendPdfDocument,
  sanitizeFileName,
  getRequestClinicId,
  getScopedRequestUserId,
  createAuditLogFromRequest,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function buildAuditReportSnapshot({
  clinicName,
  documents = [],
  correctiveActions = [],
  auditLogs = [],
  generatedAt,
}) {
  const totalDocs = documents.length
  const validDocsCount = documents.filter(d => {
    const status = getDocumentStatus(d.expiresAt).status
    return status === 'VALID' || status === 'WITHOUT_EXPIRY'
  }).length
  const documentScore = totalDocs ? Math.round((validDocsCount / totalDocs) * 100) : 100

  const openActions = correctiveActions.filter(a => ['OPEN', 'IN_PROGRESS'].includes(a.status))
  const openActionCount = openActions.length
  const criticalActionCount = openActions.filter(a => a.riskLevel === 'CRITICAL').length
  
  const attachmentCount = correctiveActions.reduce((total, a) => total + (a.attachments?.length || 0), 0)
  const traceabilityEventCount = auditLogs.length

  let executiveStatus = 'Regular'
  if (criticalActionCount > 0) {
    executiveStatus = 'Ação prioritária necessária'
  } else if (openActionCount > 0) {
    executiveStatus = 'Ações pendentes'
  } else {
    executiveStatus = 'Em conformidade'
  }

  const priorityActions = openActions.sort((left, right) => {
    const levels = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    return (levels[right.riskLevel] || 0) - (levels[left.riskLevel] || 0)
  })

  return {
    clinicName,
    documentScore,
    openActionCount,
    criticalActionCount,
    attachmentCount,
    traceabilityEventCount,
    executiveStatus,
    priorityActions,
    generatedAt,
  }
}

function registerAuditReportRoutes(options) {
  const {
    app,
    prisma,
    authMiddleware = require('./lib/middlewares').authMiddleware,
    handle = require('./lib/middlewares').handle,
    sendPdfDocument = require('./lib/helpers').sendPdfDocument,
    getScopedRequestUserId = require('./lib/helpers').getScopedRequestUserId,
    getRequestClinicId = require('./lib/helpers').getRequestClinicId,
    createAuditLogFromRequest = require('./lib/helpers').createAuditLogFromRequest,
  } = options
  app.get('/audit/report.pdf', authMiddleware, handle(async (req, res) => {
    const userId = getScopedRequestUserId(req)
    const clinicId = getRequestClinicId(req)

    const [documents, correctiveActions, auditLogs] = await Promise.all([
      prisma.clinicDocument.findMany({
        where: { userId },
      }),
      prisma.auditCorrectiveAction.findMany({
        where: { userId },
        include: { attachments: true },
      }),
      prisma.auditLog.findMany({
        where: { clinicId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const snapshot = buildAuditReportSnapshot({
      clinicName: req.currentUser?.clinicName || 'Sua Clínica',
      documents,
      correctiveActions,
      auditLogs,
      generatedAt: new Date().toISOString(),
    })

    const filename = `${sanitizeFileName(`relatorio-auditoria-${snapshot.clinicName}`, 'relatorio-auditoria')}.pdf`

    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'AUDIT_REPORT_PDF_DOWNLOAD',
      entityType: 'Clinic',
      entityId: String(clinicId),
      metadata: {
        filename,
        documentScore: snapshot.documentScore,
        openActionCount: snapshot.openActionCount,
        criticalActionCount: snapshot.criticalActionCount,
      },
    })

    sendPdfDocument(res, filename, doc => {
      doc.fontSize(20).text(`Relatório de Auditoria - ${snapshot.clinicName}`, { align: 'center' })
      doc.moveDown()
      doc.fontSize(14).text(`Status Executivo: ${snapshot.executiveStatus}`)
      doc.text(`Score de Documentos: ${snapshot.documentScore}%`)
      doc.text(`Ações Corretivas Abertas: ${snapshot.openActionCount}`)
      doc.text(`Eventos de Rastreabilidade: ${snapshot.traceabilityEventCount}`)
      doc.moveDown()
      
      doc.text('Ações Prioritárias:', { underline: true })
      snapshot.priorityActions.forEach(action => {
        doc.text(`- [${action.riskLevel}] ${action.title} (Responsável: ${action.owner})`)
      })
    })
  }))
}

module.exports = {
  buildAuditReportSnapshot,
  registerAuditReportRoutes,
}
