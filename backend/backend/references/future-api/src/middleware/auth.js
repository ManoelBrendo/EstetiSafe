const jwt = require('jsonwebtoken')
const { env } = require('../config/env')
const { httpError } = require('../lib/http')

function readBearerToken(headerValue) {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return null
  return headerValue.slice('Bearer '.length).trim()
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req.headers.authorization)

  if (!token) {
    return next(httpError(401, 'Token de autenticacao nao informado.'))
  }

  if (!env.jwtSecret) {
    return next(httpError(500, 'JWT_SECRET nao configurado para o blueprint futuro.'))
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    req.auth = {
      userId: payload.userId || null,
      clinicId: payload.clinicId || null,
      role: payload.role || 'user',
      email: payload.email || null,
      raw: payload,
    }
    return next()
  } catch (error) {
    return next(httpError(401, 'Token invalido ou expirado.'))
  }
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.auth) {
      return next(httpError(401, 'Autenticacao obrigatoria.'))
    }

    if (!roles.includes(req.auth.role)) {
      return next(httpError(403, 'Permissao insuficiente para esta operacao.'))
    }

    return next()
  }
}

module.exports = {
  requireAuth,
  requireRole,
}
