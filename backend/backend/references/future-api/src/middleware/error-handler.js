function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Rota nao encontrada neste blueprint da API futura.',
  })
}

function errorHandler(error, req, res, next) {
  const status = error.status || 500

  if (status >= 500) {
    console.error('[future-api]', error)
  }

  res.status(status).json({
    error: error.message || 'Erro interno inesperado.',
    details: error.details || null,
  })
}

module.exports = {
  errorHandler,
  notFoundHandler,
}
