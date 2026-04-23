async function recordAudit(db, payload) {
  return db.auditLog.create({
    data: {
      entityType: payload.entityType,
      entityId: payload.entityId,
      actionType: payload.actionType,
      userName: payload.userName || null,
      oldData: payload.oldData === undefined ? undefined : payload.oldData,
      newData: payload.newData === undefined ? undefined : payload.newData,
    },
  })
}

module.exports = {
  recordAudit,
}
