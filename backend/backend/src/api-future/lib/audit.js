async function createFutureAuditLog(prisma, req, payload) {
  if (!prisma?.auditLog?.create) {
    return null
  }

  const actor = req?.currentUser || {}

  return prisma.auditLog.create({
    data: {
      entityType: payload.entityType,
      entityId: payload.entityId ? String(payload.entityId) : 'unknown',
      actionType: payload.actionType,
      userName: actor.userName || actor.name || actor.email || null,
      oldData: payload.oldData ?? null,
      newData: payload.newData ?? null,
    },
  })
}

module.exports = {
  createFutureAuditLog,
}
