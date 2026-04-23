class HttpError extends Error {
  constructor(status, message, extras = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    Object.assign(this, extras)
  }
}

function httpError(status, message, extras = {}) {
  return new HttpError(status, message, extras)
}

function asyncHandler(handler) {
  return async function wrappedHandler(req, res, next) {
    try {
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

function parseUuid(value, label = 'id') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw httpError(400, `${label} invalido`)
  }

  return value
}

function pickDefined(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  )
}

module.exports = {
  HttpError,
  httpError,
  asyncHandler,
  parseUuid,
  pickDefined,
}
