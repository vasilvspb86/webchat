import { resolveRole } from '../services/roomAuthorization.js'

async function loadContext(req) {
  const prisma = req.app.locals.prisma
  const userId = req.session?.userId
  const roomId = req.params.id || req.params.roomId
  if (!userId) return { error: { status: 401, body: { error: 'Not authenticated' } } }
  let room
  try {
    room = await prisma.room.findUnique({ where: { id: roomId } })
  } catch (err) {
    // Malformed UUID or record-not-found from the DB layer → treat as 404 for privacy
    if (err?.code === 'P2023' || err?.code === 'P2025') {
      return { error: { status: 404, body: { error: 'Not found' } } }
    }
    throw err
  }
  if (!room) return { error: { status: 404, body: { error: 'Not found' } } }
  const [memberRow, banRow] = await Promise.all([
    prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId: room.id } } }),
    prisma.roomBan.findUnique({    where: { userId_roomId: { userId, roomId: room.id } } }),
  ])
  const role = resolveRole(userId, room, memberRow, banRow)
  return { room, role, memberRow, banRow }
}

export function requireRoomMember(req, res, next) {
  return loadContext(req).then((ctx) => {
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body)
    // Privacy rule: private room + non-member → 404 (never 403)
    if (!ctx.room.isPublic && (ctx.role === 'none' || ctx.role === 'banned')) {
      return res.status(404).json({ error: 'Not found' })
    }
    if (ctx.role === 'none' || ctx.role === 'banned') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    req.roomContext = ctx
    next()
  }).catch(next)
}

export function requireRoomAdmin(req, res, next) {
  return loadContext(req).then((ctx) => {
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body)
    if (!ctx.room.isPublic && (ctx.role === 'none' || ctx.role === 'banned')) {
      return res.status(404).json({ error: 'Not found' })
    }
    if (ctx.role !== 'admin' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    req.roomContext = ctx
    next()
  }).catch(next)
}

export function requireRoomOwner(req, res, next) {
  return loadContext(req).then((ctx) => {
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body)
    if (!ctx.room.isPublic && ctx.role === 'none') {
      return res.status(404).json({ error: 'Not found' })
    }
    if (ctx.role !== 'owner') return res.status(403).json({ error: 'Forbidden' })
    req.roomContext = ctx
    next()
  }).catch(next)
}
