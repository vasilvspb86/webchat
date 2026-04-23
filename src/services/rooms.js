import { RoomError } from './roomErrors.js'
import { emitRoomEvent } from '../socket/rooms.js'
import { isOnline } from '../socket/presence.js'
import {
  canEditRoom,
  canDeleteRoom,
  canReadRoom,
  resolveRole,
} from './roomAuthorization.js'
import { validateRoomName, validateRoomDescription } from '../utils/validate.js'

const PAGE_SIZE = 20

function normalize(name) { return name.trim().toLowerCase() }

export async function createRoom(prisma, io, userId, { name, description, isPublic = true }) {
  const nameErr = validateRoomName(name)
  if (nameErr) throw new RoomError('INVALID_NAME', nameErr)
  const descErr = validateRoomDescription(description)
  if (descErr) throw new RoomError('INVALID_DESCRIPTION', descErr)
  if (typeof isPublic !== 'boolean') throw new RoomError('INVALID_VISIBILITY', 'isPublic must be a boolean')

  const trimmed = name.trim()
  const nameNormalized = normalize(trimmed)
  try {
    const room = await prisma.$transaction(async (tx) => {
      const r = await tx.room.create({
        data: {
          name: trimmed, nameNormalized,
          description: description || null,
          isPublic, ownerId: userId,
        },
      })
      await tx.roomMember.create({ data: { userId, roomId: r.id, isAdmin: true } })
      return r
    })
    // Subscribe the creator's already-connected sockets to this room's channel.
    // Without this, sockets that connected before the room existed never
    // receive its realtime events (new_message, typing, member_*).
    io?.in(`user:${userId}`).socketsJoin(`room:${room.id}`)
    return room
  } catch (err) {
    if (err.code === 'P2002') throw new RoomError('NAME_TAKEN', 'Room name already taken')
    throw err
  }
}

export async function listPublicRooms(prisma, { q = '', cursor = null } = {}) {
  const where = { isPublic: true }
  if (q && q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: 'insensitive' } },
      { description: { contains: q.trim(), mode: 'insensitive' } },
    ]
  }
  if (cursor) where.createdAt = { lt: new Date(cursor) }
  const rows = await prisma.room.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    select: {
      id: true, name: true, description: true, createdAt: true,
      _count: { select: { members: true } },
    },
  })
  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null
  return {
    rooms: page.map((r) => ({
      id: r.id, name: r.name, description: r.description,
      memberCount: r._count.members, createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  }
}

async function loadCallerContext(prisma, userId, roomId) {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room) throw new RoomError('NOT_FOUND', 'Room not found')
  const [memberRow, banRow] = await Promise.all([
    prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } }),
    prisma.roomBan.findUnique({    where: { userId_roomId: { userId, roomId } } }),
  ])
  return { room, role: resolveRole(userId, room, memberRow, banRow), memberRow, banRow }
}

export async function getRoom(prisma, userId, roomId) {
  const { room, role } = await loadCallerContext(prisma, userId, roomId)
  if (!canReadRoom(role, room)) throw new RoomError('NOT_FOUND', 'Room not found')
  const memberCount = await prisma.roomMember.count({ where: { roomId } })
  return {
    id: room.id, name: room.name, description: room.description, isPublic: room.isPublic,
    ownerId: room.ownerId, createdAt: room.createdAt, updatedAt: room.updatedAt, memberCount,
  }
}

export async function listMembers(prisma, roomId) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, ownerId: true } })
  if (!room) throw new RoomError('NOT_FOUND', 'Room not found')
  const rows = await prisma.roomMember.findMany({
    where: { roomId, user: { deletedAt: null } },
    include: { user: { select: { id: true, username: true, deletedAt: true } } },
  })
  const ownerRows = []
  const adminRows = []
  const memberRows = []
  for (const r of rows) {
    const out = {
      userId: r.userId, username: r.user.username,
      isAdmin: r.isAdmin, isOwner: r.userId === room.ownerId,
      joinedAt: r.joinedAt,
      online: isOnline(r.userId),
    }
    if (out.isOwner) ownerRows.push(out)
    else if (out.isAdmin) adminRows.push(out)
    else memberRows.push(out)
  }
  const byName = (a, b) => a.username.localeCompare(b.username)
  return [...ownerRows.sort(byName), ...adminRows.sort(byName), ...memberRows.sort(byName)]
}

export async function updateRoom(prisma, io, userId, roomId, patch) {
  const { room, role } = await loadCallerContext(prisma, userId, roomId)
  if (!canEditRoom(role)) throw new RoomError('FORBIDDEN', 'Only the owner can edit this room')

  const data = {}
  const emittedFields = {}
  if (patch.name !== undefined) {
    const err = validateRoomName(patch.name); if (err) throw new RoomError('INVALID_NAME', err)
    const trimmed = patch.name.trim()
    data.name = trimmed
    data.nameNormalized = normalize(trimmed)
    emittedFields.name = trimmed
  }
  if (patch.description !== undefined) {
    const err = validateRoomDescription(patch.description); if (err) throw new RoomError('INVALID_DESCRIPTION', err)
    data.description = patch.description || null
    emittedFields.description = data.description
  }
  if (patch.isPublic !== undefined) {
    if (typeof patch.isPublic !== 'boolean') throw new RoomError('INVALID_VISIBILITY', 'isPublic must be a boolean')
    data.isPublic = patch.isPublic
    emittedFields.isPublic = patch.isPublic
  }
  if (Object.keys(data).length === 0) return room

  try {
    const updated = await prisma.room.update({ where: { id: roomId }, data })
    emitRoomEvent(io, roomId, 'room_updated', { roomId, fields: emittedFields })
    return updated
  } catch (err) {
    if (err.code === 'P2002') throw new RoomError('NAME_TAKEN', 'Room name already taken')
    throw err
  }
}

export async function deleteRoom(prisma, io, userId, roomId) {
  const { role } = await loadCallerContext(prisma, userId, roomId)
  if (!canDeleteRoom(role)) throw new RoomError('FORBIDDEN', 'Only the owner can delete this room')
  await prisma.$transaction(async (tx) => {
    // Prisma cascade relationships delete RoomMember/RoomBan/Message/Attachment rows automatically.
    await tx.room.delete({ where: { id: roomId } })
  })
  // Emit AFTER commit (scenario 75).
  emitRoomEvent(io, roomId, 'room_deleted', { roomId })
}
