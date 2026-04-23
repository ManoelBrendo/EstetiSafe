class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

function httpError(status, message, details = null) {
  return new HttpError(status, message, details)
}

function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

function parsePositiveInt(value, fieldName = 'id') {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} invalido.`)
  }

  return parsed
}

function parseOptionalDate(value, fieldName = 'date') {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, `${fieldName} invalido.`)
  }

  return parsed
}

function sanitizeCpf(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

function pickPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const rawPageSize = Number.parseInt(query.pageSize ?? query.limit, 10) || 20
  const pageSize = Math.min(100, Math.max(1, rawPageSize))

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

function buildPaginated(items, total, pagination) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  }
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

module.exports = {
  HttpError,
  httpError,
  asyncHandler,
  parsePositiveInt,
  parseOptionalDate,
  sanitizeCpf,
  pickPagination,
  buildPaginated,
  compactObject,
}
