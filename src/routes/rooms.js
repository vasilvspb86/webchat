import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ROOM_ERROR_CODES } from '../services/roomErrors.js'
import * as rooms from '../services/rooms.js'
import * as membership from '../services/roomMembership.js'

const router = Router()

function errorStatus(code) {
  return ROOM_ERROR_CODES[code] ?? 500
}

function sendError(res, err, next) {
  if (err?.code && err.message) return res.status(errorStatus(err.code)).json({ error: err.message, code: err.code })
  return next(err)
}

router.use(requireAuth)

router.post('/', async (req, res, next) => {
  try {
    const room = await rooms.createRoom(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.body)
    res.status(201).json({ room })
  } catch (err) { sendError(res, err, next) }
})

router.get('/', async (req, res, next) => {
  try {
    const page = await rooms.listPublicRooms(req.app.locals.prisma, { q: req.query.q || '', cursor: req.query.cursor || null })
    res.json(page)
  } catch (err) { sendError(res, err, next) }
})

router.get('/mine', async (req, res, next) => {
  try {
    const rooms = await membership.listMyRooms(req.app.locals.prisma, req.session.userId)
    res.json({ rooms })
  } catch (err) { sendError(res, err, next) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const room = await rooms.getRoom(req.app.locals.prisma, req.session.userId, req.params.id)
    res.json({ room })
  } catch (err) { sendError(res, err, next) }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const room = await rooms.updateRoom(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, req.body)
    res.json({ room })
  } catch (err) { sendError(res, err, next) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await rooms.deleteRoom(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.get('/:id/members', async (req, res, next) => {
  try {
    await rooms.getRoom(req.app.locals.prisma, req.session.userId, req.params.id)
    const members = await rooms.listMembers(req.app.locals.prisma, req.params.id)
    res.json({ members })
  } catch (err) { sendError(res, err, next) }
})

router.post('/:id/join', async (req, res, next) => {
  try {
    await membership.joinRoom(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.post('/:id/leave', async (req, res, next) => {
  try {
    await membership.leaveRoom(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    await membership.removeMember(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, req.params.userId)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.post('/:id/admins', async (req, res, next) => {
  try {
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ error: 'userId required', code: 'INVALID_INPUT' })
    await membership.grantAdmin(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, userId)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.delete('/:id/admins/:userId', async (req, res, next) => {
  try {
    await membership.revokeAdmin(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, req.params.userId)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.get('/:id/bans', async (req, res, next) => {
  try {
    const bans = await membership.listBans(req.app.locals.prisma, req.session.userId, req.params.id)
    res.json({ bans })
  } catch (err) { sendError(res, err, next) }
})

router.delete('/:id/bans/:userId', async (req, res, next) => {
  try {
    await membership.unbanUser(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, req.params.userId)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.post('/:id/invitations', async (req, res, next) => {
  try {
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ error: 'userId required', code: 'INVALID_INPUT' })
    const notif = await membership.inviteUser(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id, { userId })
    res.status(201).json({ invitation: { id: notif.id, expiresAt: notif.expiresAt } })
  } catch (err) { sendError(res, err, next) }
})

router.get('/:id/invitations', async (req, res, next) => {
  try {
    // Privacy precedence for private rooms: hide from non-members as 404.
    const room = await req.app.locals.prisma.room.findUnique({ where: { id: req.params.id } })
    if (!room) return res.status(404).json({ error: 'Not found' })
    if (!room.isPublic) {
      const m = await req.app.locals.prisma.roomMember.findUnique({
        where: { userId_roomId: { userId: req.session.userId, roomId: req.params.id } },
      })
      if (!m) return res.status(404).json({ error: 'Not found' })
    }
    const invitations = await membership.listPendingInvitations(
      req.app.locals.prisma, req.session.userId, req.params.id,
    )
    res.json({ invitations })
  } catch (err) { sendError(res, err, next) }
})

router.delete('/:id/invitations/:notificationId', async (req, res, next) => {
  try {
    await membership.revokeInvitation(
      req.app.locals.prisma, req.app.locals.io,
      req.session.userId, req.params.id, req.params.notificationId,
    )
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

export default router
