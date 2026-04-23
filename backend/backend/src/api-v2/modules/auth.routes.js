const express = require('express')
const { asyncHandler } = require('../lib/http')
const { loginSchema } = require('../schemas')

function createAuthRouter(context) {
  const router = express.Router()

  router.post('/login', asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body)
    const session = await context.auth.login(payload)
    res.json(session)
  }))

  router.get('/me', context.auth.authMiddleware, asyncHandler(async (req, res) => {
    if (req.user?.support && !req.currentUser) {
      return res.json(context.auth.serializeSupportUser())
    }

    return res.json(context.auth.serializeUserWithContext(req.currentUser, req.supportContext))
  }))

  return router
}

module.exports = {
  createAuthRouter,
}
