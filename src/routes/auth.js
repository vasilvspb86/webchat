import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as authService from '../services/auth.js'

const router = Router()

const PERSISTENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function errorStatus(code) {
  switch (code) {
    case 'INVALID_EMAIL':
    case 'INVALID_USERNAME':
    case 'INVALID_PASSWORD':
    case 'INVALID_INPUT':
    case 'PASSWORD_MISMATCH':
    case 'INVALID_TOKEN':
      return 400
    case 'INVALID_CREDENTIALS':
      return 401
    case 'EMAIL_TAKEN':
    case 'USERNAME_TAKEN':
      return 409
    case 'NOT_FOUND':
      return 404
    default:
      return 500
  }
}

function sendError(res, err, next) {
  if (err?.code && err.message) return res.status(errorStatus(err.code)).json({ error: err.message, code: err.code })
  return next(err)
}

function setSession(req, user, persistent) {
  req.session.userId = user.id
  req.session.userAgent = req.headers['user-agent'] || 'Unknown'
  req.session.ip = req.ip
  req.session.createdAt = new Date().toISOString()
  if (persistent) req.session.cookie.maxAge = PERSISTENT_MAX_AGE_MS
}

router.post('/register', async (req, res, next) => {
  try {
    const user = await authService.register(req.app.locals.prisma, req.body)
    setSession(req, user, false)
    res.status(201).json({ user })
  } catch (err) { sendError(res, err, next) }
})

router.post('/login', async (req, res, next) => {
  try {
    const user = await authService.login(req.app.locals.prisma, req.body)
    setSession(req, user, Boolean(req.body?.persistent))
    res.json({ user })
  } catch (err) { sendError(res, err, next) }
})

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const user = await prisma.user.findFirst({
      where: { id: req.session.userId, deletedAt: null },
      select: { id: true, email: true, username: true },
    })
    if (!user) {
      return req.session.destroy(() => res.status(401).json({ error: 'Session expired' }))
    }
    res.json({ user })
  } catch (err) { next(err) }
})

router.post('/forgot-password', async (req, res, next) => {
  try {
    await authService.requestPasswordReset(req.app.locals.prisma, req.body)
    res.json({ ok: true })
  } catch (err) {
    // Anti-enumeration: service returns silently for unknown emails; only surface validation errors.
    if (err?.code === 'INVALID_EMAIL') return res.status(400).json({ error: err.message, code: err.code })
    next(err)
  }
})

router.post('/reset-password', async (req, res, next) => {
  try {
    await authService.resetPassword(req.app.locals.prisma, req.body)
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    await authService.changePassword(req.app.locals.prisma, {
      userId: req.session.userId,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      currentSid: req.sessionID,
    })
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await authService.listSessions(req.app.locals.prisma, {
      userId: req.session.userId,
      currentSid: req.sessionID,
    })
    res.json({ sessions })
  } catch (err) { next(err) }
})

router.delete('/sessions/:sid', requireAuth, async (req, res, next) => {
  try {
    const isCurrent = req.params.sid === req.sessionID
    await authService.revokeSession(req.app.locals.prisma, {
      userId: req.session.userId, sid: req.params.sid,
    })
    if (isCurrent) {
      return req.session.destroy(() => {
        res.clearCookie('connect.sid')
        res.json({ ok: true })
      })
    }
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    await authService.deleteAccount(req.app.locals.prisma, { userId: req.session.userId })
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ ok: true })
    })
  } catch (err) { sendError(res, err, next) }
})

export default router
