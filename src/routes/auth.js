import { Router } from 'express'
import bcrypt from 'bcrypt'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res, next) => {
  const { email, username, password } = req.body
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username and password are required' })
  }
  try {
    const prisma = req.app.locals.prisma
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), username, passwordHash },
      select: { id: true, email: true, username: true },
    })
    req.session.userId = user.id
    res.status(201).json({ user })
  } catch (err) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('email') ? 'Email' : 'Username'
      return res.status(409).json({ error: `${field} already taken` })
    }
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  const { email, password, persistent } = req.body
  try {
    const prisma = req.app.locals.prisma
    const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    req.session.userId = user.id
    req.session.userAgent = req.headers['user-agent'] || 'Unknown'
    req.session.ip = req.ip
    if (persistent) req.session.cookie.maxAge = 24 * 60 * 60 * 1000
    res.json({ user: { id: user.id, email: user.email, username: user.username } })
  } catch (err) { next(err) }
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
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, email: true, username: true },
    })
    if (!user) return res.status(401).json({ error: 'Session expired' })
    res.json({ user })
  } catch (err) { next(err) }
})

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const sessions = await prisma.user_sessions.findMany({
      where: { expire: { gt: new Date() }, sess: { path: ['userId'], equals: req.session.userId } },
      select: { sid: true, sess: true, expire: true },
    })
    res.json({
      sessions: sessions.map(s => ({
        sid: s.sid,
        userAgent: s.sess.userAgent || 'Unknown',
        ip: s.sess.ip || 'Unknown',
        expire: s.expire,
        isCurrent: s.sid === req.sessionID,
      })),
    })
  } catch (err) { next(err) }
})

router.delete('/sessions/:sid', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const session = await prisma.user_sessions.findUnique({ where: { sid: req.params.sid } })
    if (!session || session.sess?.userId !== req.session.userId) {
      return res.status(404).json({ error: 'Session not found' })
    }
    await prisma.user_sessions.delete({ where: { sid: req.params.sid } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/reset-password', async (req, res, next) => {
  const { email, currentPassword, newPassword } = req.body
  try {
    const prisma = req.app.locals.prisma
    const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } })
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body
  try {
    const prisma = req.app.locals.prisma
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    await prisma.room.deleteMany({ where: { ownerId: req.session.userId } })
    await prisma.user.delete({ where: { id: req.session.userId } })
    req.session.destroy()
    res.clearCookie('connect.sid')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
