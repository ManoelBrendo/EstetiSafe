const express = require('express')
const { asyncHandler } = require('../lib/async-handler')
const { httpError } = require('../lib/http')
const { requireAuth } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { loginSchema } = require('../schemas')

const authRouter = express.Router()

authRouter.post('/login', validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  throw httpError(
    501,
    'O schema futuro ainda nao traz entidades de usuario/clinica. Conecte esta rota ao servico real de autenticacao antes de ativar o blueprint.'
  )
}))

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.auth })
})

module.exports = {
  authRouter,
}
