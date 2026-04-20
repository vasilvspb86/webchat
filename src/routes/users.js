const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/users/search?q=username — find users by username
router.get('/search', async (req, res, next) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'Query required' })
  try {
    const prisma = req.app.locals.prisma
    const users = await prisma.user.findMany({
      where: { username: { contains: q, mode: 'insensitive' }, NOT: { id: req.session.userId } },
      select: { id: true, username: true },
      take: 20,
    })
    res.json({ users })
  } catch (err) { next(err) }
})

// GET /api/users/friends — friend list with presence (presence injected from memory)
router.get('/friends', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    })
    const friends = friendships.map(f => f.requesterId === userId ? f.addressee : f.requester)
    res.json({ friends })
  } catch (err) { next(err) }
})

// POST /api/users/friends/request — send friend request by username
router.post('/friends/request', async (req, res, next) => {
  const { username, message } = req.body
  try {
    const prisma = req.app.locals.prisma
    const io = req.app.locals.io
    const userId = req.session.userId
    const target = await prisma.user.findUnique({ where: { username } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.id === userId) return res.status(400).json({ error: 'Cannot add yourself' })

    // Check for existing ban in either direction
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
      data: {
        userId: target.id,
        type: 'FRIEND_REQUEST',
        payload: { fromUserId: userId, message },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    io.to(`user:${target.id}`).emit('notification', notification)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/users/friends/respond — accept or decline a friend request
router.post('/friends/respond', async (req, res, next) => {
  const { requesterId, accept } = req.body
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const friendship = await prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId, addresseeId: userId } },
    })
    if (!friendship || friendship.status !== 'PENDING') return res.status(404).json({ error: 'Request not found' })
    await prisma.friendship.update({
      where: { requesterId_addresseeId: { requesterId, addresseeId: userId } },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED' },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/users/friends/:userId — remove a friend
router.delete('/friends/:userId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: req.params.userId },
          { requesterId: req.params.userId, addresseeId: userId },
        ],
        status: 'ACCEPTED',
      },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/users/ban/:userId — ban a user
router.post('/ban/:userId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    await prisma.$transaction([
      prisma.userBan.upsert({
        where: { bannerId_bannedId: { bannerId: userId, bannedId: req.params.userId } },
        create: { bannerId: userId, bannedId: req.params.userId },
        update: {},
      }),
      // Terminate friendship
      prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: req.params.userId },
            { requesterId: req.params.userId, addresseeId: userId },
          ],
        },
      }),
    ])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/users/ban/:userId — unban a user
router.delete('/ban/:userId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    await prisma.userBan.deleteMany({
      where: { bannerId: req.session.userId, bannedId: req.params.userId },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
