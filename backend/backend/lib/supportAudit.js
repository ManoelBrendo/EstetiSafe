const SUPPORT_ADMIN_EMAIL = process.env.SUPPORT_ADMIN_EMAIL || 'suporte@lappui.com'

function getAuditActorData(req) {
  if (req.user?.impersonatedBySupport || req.user?.support) {
    return {
      actorUserId: null,
      actorEmail: req.user.supportEmail || req.user.email || SUPPORT_ADMIN_EMAIL || null,
      actorRole: 'SUPPORT',
    }
  }

  return {
    actorUserId: req.currentUser?.id || req.user?.id || null,
    actorEmail: req.currentUser?.email || req.user?.email || null,
    actorRole: req.currentUser?.role || req.user?.role || null,
  }
}

module.exports = {
  getAuditActorData,
}
