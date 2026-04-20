import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/search', async (req, res, next) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'Query required' })
  try {
    const users = await req.app.locals.prisma.user.findMany({
      where: { username: { contains: q, mode: 'insensitive' }, NOT: { id: req.session.userId } },
      select: { id: true, username: true },
      take: 20,
    })
    res.json({ users })
  } catch (err) { next(err) }
})

router.get('/friends', async (req, res, next) => {
  try {
    const { userId } = req.session
    const friendships = await req.app.locals.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    })
    res.json({ friends: friendships.map(f => f.requesterId === userId ? f.addressee : f.requester) })
  } catch (err) { next(err) }
})

router.post('/friends/request', async (req, res, next) => {
  const { username, message } = req.body
  try {
    const { prisma, io } = req.app.locals
    const { userId } = req.session
    const target = await prisma.user.findUnique({ where: { username } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.id === userId) return res.status(400).json({ error: 'Cannot add yourself' })
    const ban = await prisma.userBan.findFirst({
      where: { OR: [{ bannerId: userId, bannedId: target.id }, { bannerId: target.id, bannedId: userId }] },
    })
    if (ban) return res.status(403).json({ error: 'Cannot send request' })
    await prisma.friendship.upsert({
      where: { requesterId_addresseeId: { requesterId: userId, addresseeId: target.id } },
      create: { requesterId: userId, addresseeId: target.id, message, status: 'PENDING' },
      update: { status: 'PENDING', message },
    })
    const notification = await prisma.notification.create({
      data: { userId: target.id, type: 'FRIEND_REQUEST', payload: { fromUserId: userId, message }, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    io.to(`user:${target.id}`).emit('notification', notification)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/friends/respond', async (req, res, next) => {
  const { requesterId, accept } = req.body
  try {
    const { userId } = req.session
    const friendship = await req.app.locals.prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId, addresseeId: userId } },
    })
    if (!friendship || friendship.status !== 'PENDING') return res.status(404).json({ error: 'Request not found' })
    await req.app.locals.prisma.friendship.update({
      where: { requesterId_addresseeId: { requesterId, addresseeId: userId } },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED' },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/friends/:userId', async (req, res, next) => {
  try {
    const { userId } = req.session
    await req.app.locals.prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: userId, addresseeId: req.params.userId }, { requesterId: req.params.userId, addresseeId: userId }], status: 'ACCEPTED' },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/ban/:userId', async (req, res, next) => {
  try {
    const { userId } = req.session
    await req.app.locals.prisma.$transaction([
      req.app.locals.prisma.userBan.upsert({
        where: { bannerId_bannedId: { bannerId: userId, bannedId: req.params.userId } },
        create: { bannerId: userId, bannedId: req.params.userId },
        update: {},
      }),
      req.app.locals.prisma.friendship.deleteMany({
        where: { OR: [{ requesterId: userId, addresseeId: req.params.userId }, { requesterId: req.params.userId, addresseeId: userId }] },
      }),
    ])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/ban/:userId', async (req, res, next) => {
  try {
    await req.app.locals.prisma.userBan.deleteMany({ where: { bannerId: req.session.userId, bannedId: req.params.userId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
