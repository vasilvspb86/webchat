import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/public', async (req, res, next) => {
  const { q } = req.query
  try {
    const rooms = await req.app.locals.prisma.room.findMany({
      where: { isPublic: true, ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }) },
      select: { id: true, name: true, description: true, _count: { select: { members: true } } },
    })
    res.json({ rooms: rooms.map(r => ({ ...r, memberCount: r._count.members })) })
  } catch (err) { next(err) }
})

router.get('/mine', async (req, res, next) => {
  try {
    const memberships = await req.app.locals.prisma.roomMember.findMany({
      where: { userId: req.session.userId },
      include: { room: { select: { id: true, name: true, isPublic: true, ownerId: true } } },
    })
    res.json({ rooms: memberships.map(m => ({ ...m.room, isAdmin: m.isAdmin })) })
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  const { name, description, isPublic = true } = req.body
  if (!name) return res.status(400).json({ error: 'Room name is required' })
  try {
    const room = await req.app.locals.prisma.room.create({
      data: { name, description, isPublic, ownerId: req.session.userId, members: { create: { userId: req.session.userId, isAdmin: true } } },
    })
    res.status(201).json({ room })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Room name already taken' })
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: { select: { id: true, username: true } } } }, bans: { include: { bannedBy: { select: { username: true } } } } },
    })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    const isMember = room.members.some(m => m.userId === req.session.userId)
    if (!room.isPublic && !isMember) return res.status(403).json({ error: 'Access denied' })
    res.json({ room })
  } catch (err) { next(err) }
})

router.post('/:id/join', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const { userId } = req.session
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!room.isPublic) return res.status(403).json({ error: 'Room is private — join via invitation' })
    const ban = await prisma.roomBan.findUnique({ where: { userId_roomId: { userId, roomId: room.id } } })
    if (ban) return res.status(403).json({ error: 'You are banned from this room' })
    await prisma.roomMember.upsert({ where: { userId_roomId: { userId, roomId: room.id } }, create: { userId, roomId: room.id }, update: {} })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:id/leave', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const { userId } = req.session
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId === userId) return res.status(400).json({ error: 'Owner cannot leave — delete the room instead' })
    await prisma.roomMember.deleteMany({ where: { userId, roomId: room.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { prisma, io } = req.app.locals
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Only the owner can delete this room' })
    await prisma.room.delete({ where: { id: req.params.id } })
    io.to(req.params.id).emit('room_deleted', { roomId: req.params.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.patch('/:id', async (req, res, next) => {
  const { name, description, isPublic } = req.body
  try {
    const { prisma } = req.app.locals
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Only the owner can edit room settings' })
    const updated = await prisma.room.update({ where: { id: req.params.id }, data: { ...(name && { name }), ...(description !== undefined && { description }), ...(isPublic !== undefined && { isPublic }) } })
    res.json({ room: updated })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Room name already taken' })
    next(err)
  }
})

router.post('/:id/members/:userId/admin', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Owner only' })
    await prisma.roomMember.update({ where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } }, data: { isAdmin: true } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/:id/members/:userId/admin', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.ownerId !== req.session.userId) return res.status(403).json({ error: 'Owner only' })
    if (req.params.userId === room.ownerId) return res.status(400).json({ error: 'Cannot remove owner admin rights' })
    await prisma.roomMember.update({ where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } }, data: { isAdmin: false } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:id/ban/:userId', async (req, res, next) => {
  try {
    const { prisma, io } = req.app.locals
    const actor = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } } })
    if (!actor?.isAdmin) return res.status(403).json({ error: 'Admins only' })
    await prisma.$transaction([
      prisma.roomMember.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } }),
      prisma.roomBan.upsert({ where: { userId_roomId: { userId: req.params.userId, roomId: req.params.id } }, create: { userId: req.params.userId, roomId: req.params.id, bannedById: req.session.userId }, update: { bannedById: req.session.userId, bannedAt: new Date() } }),
    ])
    io.to(req.params.id).emit('member_banned', { roomId: req.params.id, userId: req.params.userId })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/:id/ban/:userId', async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const actor = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } } })
    if (!actor?.isAdmin) return res.status(403).json({ error: 'Admins only' })
    await prisma.roomBan.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:id/invite', async (req, res, next) => {
  const { username } = req.body
  try {
    const { prisma, io } = req.app.locals
    const room = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room || room.isPublic) return res.status(400).json({ error: 'Only private rooms need invitations' })
    const isMember = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } } })
    if (!isMember) return res.status(403).json({ error: 'Not a member' })
    const target = await prisma.user.findUnique({ where: { username } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    const notification = await prisma.notification.create({
      data: { userId: target.id, type: 'ROOM_INVITE', payload: { roomId: room.id, roomName: room.name, invitedBy: req.session.userId }, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    io.to(`user:${target.id}`).emit('notification', notification)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
