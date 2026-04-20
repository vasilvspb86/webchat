const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/rooms/public — room catalog with search
router.get('/public', async (req, res, next) => {
  const { q } = req.query
  try {
    const prisma = req.app.locals.prisma
    const rooms = await prisma.room.findMany({
      where: {
        isPublic: true,
        ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }),
      },
      select: {
        id: true, name: true, description: true,
        _count: { select: { members: true } },
      },
    })
    res.json({ rooms: rooms.map(r => ({ ...r, memberCount: r._count.members })) })
  } catch (err) { next(err) }
})

// GET /api/rooms/mine — rooms the current user belongs to
router.get('/mine', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const memberships = await prisma.roomMember.findMany({
      where: { userId: req.session.userId },
      include: { room: { select: { id: true, name: true, isPublic: true, ownerId: true } } },
    })
    res.json({ rooms: memberships.map(m => ({ ...m.room, isAdmin: m.isAdmin })) })
  } catch (err) { next(err) }
})

// POST /api/rooms — create a room
router.post('/', async (req, res, next) => {
  const { name, description, isPublic = true } = req.body
  if (!name) return res.status(400).json({ error: 'Room name is required' })
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.create({
      data: {
        name, description, isPublic,
        ownerId: req.session.userId,
        members: { create: { userId: req.session.userId, isAdmin: true } },
      },
    })
    res.status(201).json({ room })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Room name already taken' })
    next(err)
  }
})

// GET /api/rooms/:id — room details
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
        bans: { include: { bannedBy: { select: { username: true } } } },
      },
    })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    const isMember = room.members.some(m => m.userId === userId)
    if (!room.isPublic && !isMember) return res.status(403).json({ error: 'Access denied' })
    res.json({ room })
  } catch (err) { next(err) }
})

// POST /api/rooms/:id/join — join a public room
router.post('/:id/join', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!room.isPublic) return res.status(403).json({ error: 'Room is private — join via invitation' })
    const ban = await prisma.roomBan.findUnique({ where: { userId_roomId: { userId, roomId: room.id } } })
    if (ban) return res.status(403).json({ error: 'You are banned from this room' })
    await prisma.roomMember.upsert({
      where: { userId_roomId: { userId, roomId: room.id } },
      create: { userId, roomId: room.id },
      update: {},
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/rooms/:id/leave — leave a room
router.post('/:id/leave', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId === userId) return res.status(400).json({ error: 'Owner cannot leave — delete the room instead' })
    await prisma.roomMember.deleteMany({ where: { userId, roomId: room.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/rooms/:id — delete room (owner only)
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Only the owner can delete this room' })
    await prisma.room.delete({ where: { id: req.params.id } })
    req.app.locals.io.to(req.params.id).emit('room_deleted', { roomId: req.params.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// PATCH /api/rooms/:id — update room settings (owner only)
router.patch('/:id', async (req, res, next) => {
  const { name, description, isPublic } = req.body
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Only the owner can edit room settings' })
    const updated = await prisma.room.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(isPublic !== undefined && { isPublic }) },
    })
    res.json({ room: updated })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Room name already taken' })
    next(err)
  }
})

// POST /api/rooms/:id/members/:userId/admin — grant admin (owner only)
router.post('/:id/members/:userId/admin', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Owner only' })
    await prisma.roomMember.update({
      where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } },
      data: { isAdmin: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/rooms/:id/members/:userId/admin — revoke admin (owner only)
router.delete('/:id/members/:userId/admin', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Owner only' })
    if (req.params.userId === room.ownerId) return res.status(400).json({ error: 'Cannot remove owner admin rights' })
    await prisma.roomMember.update({
      where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } },
      data: { isAdmin: false },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/rooms/:id/ban/:userId — ban a member (admin+)
router.post('/:id/ban/:userId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const actorMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } },
    })
    if (!actorMembership?.isAdmin) return res.status(403).json({ error: 'Admins only' })
    // Remove from members and add to ban list
    await prisma.$transaction([
      prisma.roomMember.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } }),
      prisma.roomBan.upsert({
        where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } },
        create: { userId: req.params.userId, roomId: req.params.id, bannedById: req.session.userId },
        update: { bannedById: req.session.userId, bannedAt: new Date() },
      }),
    ])
    req.app.locals.io.to(req.params.id).emit('member_banned', { roomId: req.params.id, userId: req.params.userId })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/rooms/:id/ban/:userId — unban (admin+)
router.delete('/:id/ban/:userId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const actorMembership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } },
    })
    if (!actorMembership?.isAdmin) return res.status(403).json({ error: 'Admins only' })
    await prisma.roomBan.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/rooms/:id/invite — invite user to private room
router.post('/:id/invite', async (req, res, next) => {
  const { username } = req.body
  try {
    const prisma = req.app.locals.prisma
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.isPublic) return res.status(400).json({ error: 'Only private rooms need invitations' })
    const isMember = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } },
    })
    if (!isMember) return res.status(403).json({ error: 'Not a member' })
    const target = await prisma.user.findUnique({ where: { username } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: 'ROOM_INVITE',
        payload: { roomId: room.id, roomName: room.name, invitedBy: req.session.userId },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    req.app.locals.io.to(`user:${target.id}`).emit('notification', { type: 'ROOM_INVITE', roomId: room.id, roomName: room.name })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
