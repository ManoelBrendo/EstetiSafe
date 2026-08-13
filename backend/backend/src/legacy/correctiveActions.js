const {
  parseId,
  httpError,
  getAuditCorrectiveUserId,
  createAuditLogFromRequest,
  getRequestClinicId,
  auditCorrectiveActionSchema,
  auditCorrectiveActionPatchSchema,
  auditCorrectiveActionAttachmentSchema,
  auditCorrectiveActionInclude,
  auditCorrectiveActionAttachmentSelect,
  serializeAuditCorrectiveAction,
  serializeAuditCorrectiveActionAttachment,
  serializeAuditCorrectiveActionAttachmentFile,
  buildAuditCorrectiveActionData,
  getAuditCorrectiveActionForRequest,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerCorrectiveActionRoutes({
  app,
  prisma,
}) {
  app.get('/audit-corrective-actions', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const actions = await prisma.auditCorrectiveAction.findMany({
      where: { userId },
      include: auditCorrectiveActionInclude,
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
    })

    res.json({
      total: actions.length,
      items: actions.map(serializeAuditCorrectiveAction),
    })
  }))

  app.post('/audit-corrective-actions', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const data = auditCorrectiveActionSchema.parse(req.body)
    const normalized = buildAuditCorrectiveActionData(data)

    const action = await prisma.auditCorrectiveAction.upsert({
      where: {
        userId_taskKey: {
          userId,
          taskKey: data.taskKey,
        },
      },
      create: {
        userId,
        taskKey: data.taskKey,
        ...normalized,
      },
      update: normalized,
      include: auditCorrectiveActionInclude,
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'AUDIT_CORRECTIVE_ACTION_UPSERT',
      entityType: 'AuditCorrectiveAction',
      entityId: action.id,
      metadata: {
        taskKey: action.taskKey,
        domainId: action.domainId,
        title: action.title,
        owner: action.owner,
        dueLabel: action.dueLabel,
        dueAt: action.dueAt ? action.dueAt.toISOString() : null,
        evidence: action.evidence,
        status: action.status,
        riskLevel: action.riskLevel,
      },
    })

    res.status(201).json(serializeAuditCorrectiveAction(action))
  }))

  app.post('/audit-corrective-actions/:id/attachments', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const actionId = parseId(req.params.id, 'actionId')
    const data = auditCorrectiveActionAttachmentSchema.parse(req.body)
    const action = await getAuditCorrectiveActionForRequest(userId, actionId)

    const attachment = await prisma.auditCorrectiveActionAttachment.create({
      data: {
        userId,
        actionId,
        fileName: data.fileName,
        fileMimeType: data.fileMimeType?.trim() || null,
        fileDataUrl: data.fileDataUrl,
        notes: data.notes?.trim() || null,
      },
      select: auditCorrectiveActionAttachmentSelect,
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'AUDIT_CORRECTIVE_ACTION_ATTACHMENT_CREATE',
      entityType: 'AuditCorrectiveAction',
      entityId: action.id,
      metadata: {
        taskKey: action.taskKey,
        title: action.title,
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        notes: attachment.notes,
      },
    })

    res.status(201).json(serializeAuditCorrectiveActionAttachment(attachment))
  }))

  app.get('/audit-corrective-actions/:actionId/attachments/:attachmentId', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const actionId = parseId(req.params.actionId, 'actionId')
    const attachmentId = parseId(req.params.attachmentId, 'attachmentId')

    await getAuditCorrectiveActionForRequest(userId, actionId)

    const attachment = await prisma.auditCorrectiveActionAttachment.findFirst({
      where: {
        id: attachmentId,
        actionId,
        userId,
      },
    })

    if (!attachment) {
      throw httpError(404, 'Anexo não encontrado.')
    }

    res.json(serializeAuditCorrectiveActionAttachmentFile(attachment))
  }))

  app.delete('/audit-corrective-actions/:actionId/attachments/:attachmentId', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const actionId = parseId(req.params.actionId, 'actionId')
    const attachmentId = parseId(req.params.attachmentId, 'attachmentId')
    const action = await getAuditCorrectiveActionForRequest(userId, actionId)

    const attachment = await prisma.auditCorrectiveActionAttachment.findFirst({
      where: {
        id: attachmentId,
        actionId,
        userId,
      },
      select: auditCorrectiveActionAttachmentSelect,
    })

    if (!attachment) {
      throw httpError(404, 'Anexo não encontrado.')
    }

    await prisma.auditCorrectiveActionAttachment.delete({
      where: { id: attachmentId },
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'AUDIT_CORRECTIVE_ACTION_ATTACHMENT_DELETE',
      entityType: 'AuditCorrectiveAction',
      entityId: action.id,
      metadata: {
        taskKey: action.taskKey,
        title: action.title,
        attachmentId: attachment.id,
        fileName: attachment.fileName,
      },
    })

    res.status(204).end()
  }))

  app.patch('/audit-corrective-actions/:id', authMiddleware, handle(async (req, res) => {
    const userId = getAuditCorrectiveUserId(req)
    const actionId = parseId(req.params.id, 'actionId')
    const data = auditCorrectiveActionPatchSchema.parse(req.body)

    await getAuditCorrectiveActionForRequest(userId, actionId)

    const action = await prisma.auditCorrectiveAction.update({
      where: { id: actionId },
      data: buildAuditCorrectiveActionData(data),
      include: auditCorrectiveActionInclude,
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'AUDIT_CORRECTIVE_ACTION_UPDATE',
      entityType: 'AuditCorrectiveAction',
      entityId: action.id,
      metadata: {
        taskKey: action.taskKey,
        title: action.title,
        owner: action.owner,
        dueLabel: action.dueLabel,
        dueAt: action.dueAt ? action.dueAt.toISOString() : null,
        evidence: action.evidence,
        status: action.status,
        changedFields: Object.keys(data),
      },
    })

    res.json(serializeAuditCorrectiveAction(action))
  }))
}

module.exports = {
  registerCorrectiveActionRoutes,
}
