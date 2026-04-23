function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}

function pickPagination(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100)

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

function sendPaginated(res, items, total, pagination) {
  return res.json({
    items,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      pageCount: Math.max(Math.ceil(total / pagination.pageSize), 1),
    },
  })
}

function compactObject(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  )
}

function parseDateOrNull(value) {
  if (!value) return null
  return new Date(value)
}

function notImplementedIntegration(name) {
  return httpError(501, `${name} ainda depende de um adaptador externo antes de ir para producao.`)
}

module.exports = {
  compactObject,
  httpError,
  notImplementedIntegration,
  parseDateOrNull,
  pickPagination,
  sendPaginated,
}
