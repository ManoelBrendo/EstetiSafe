function validate({ body, params, query }) {
  return function validationMiddleware(req, res, next) {
    try {
      if (body) {
        req.body = body.parse(req.body)
      }

      if (params) {
        req.params = params.parse(req.params)
      }

      if (query) {
        req.query = query.parse(req.query)
      }

      return next()
    } catch (error) {
      error.status = 400
      return next(error)
    }
  }
}

module.exports = {
  validate,
}
