const express = require('express')
const bcrypt = require('bcryptjs')
const { asyncHandler } = require('../lib/http')
const { loginSchema } = require('../schemas')
const { createAuditLog } = require('../lib/audit')

function createAuthRouter(context) {
  const router = express.Router()

  router.post('/login', asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body)
    const session = await context.auth.login(payload)

    res.cookie('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    })

    res.json({
      token: session.token,
      user: session.user,
    })
  }))

  router.post('/logout', asyncHandler(async (req, res) => {
    res.clearCookie('refreshToken', {
      path: '/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    res.json({ success: true })
  }))

  router.post('/refresh', asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token ausente.' })
    }

    let payload
    try {
      payload = context.auth.verifyToken(refreshToken)
    } catch {
      return res.status(401).json({ error: 'Refresh token invalido ou expirado.' })
    }

    const newAccessToken = context.auth.signToken({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      support: payload.support,
      supportName: payload.supportName,
    })

    res.json({ token: newAccessToken })
  }))

  router.get('/me', context.auth.authMiddleware, asyncHandler(async (req, res) => {
    if (req.user?.support && !req.currentUser) {
      return res.json(context.auth.serializeSupportUser())
    }

    return res.json(context.auth.serializeUserWithContext(req.currentUser, req.supportContext))
  }))

  router.post('/verify-password', context.auth.authMiddleware, asyncHandler(async (req, res) => {
    const { password } = req.body
    if (!password) {
      return res.status(400).json({ error: 'Senha é obrigatória.' })
    }

    let passwordMatches = false
    if (req.user?.support) {
      const leftBuffer = Buffer.from(String(password), 'utf8')
      const rightBuffer = Buffer.from(String(context.supportAdminPassword || ''), 'utf8')
      if (leftBuffer.length === rightBuffer.length) {
        const crypto = require('node:crypto')
        passwordMatches = crypto.timingSafeEqual(leftBuffer, rightBuffer)
      }
    } else if (req.currentUser) {
      passwordMatches = await bcrypt.compare(password, req.currentUser.hashedPassword)
    }

    if (!passwordMatches) {
      await createAuditLog(context.prisma, req, context.auth, {
        action: 'API_V2_AUTH_LOCK_UNLOCK_FAILED',
        entityType: 'User',
        entityId: req.user?.id || 0,
        metadata: { path: '/api/v2/auth/verify-password', email: req.user?.email },
      })
      return res.status(401).json({ error: 'Senha incorreta.' })
    }

    await createAuditLog(context.prisma, req, context.auth, {
      action: 'API_V2_AUTH_LOCK_UNLOCK_SUCCESS',
      entityType: 'User',
      entityId: req.user?.id || 0,
      metadata: { path: '/api/v2/auth/verify-password', email: req.user?.email },
    })

    res.json({ success: true })
  }))

  return router
}

module.exports = {
  createAuthRouter,
}
