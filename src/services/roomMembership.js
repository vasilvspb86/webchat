import { RoomError } from './roomErrors.js'
import { emitRoomEvent } from '../socket/rooms.js'
import {
  resolveRole,
  canInviteToRoom,
  canRemoveMember,
  canUnban,
  canViewBans,
  canGrantAdmin,
  canRevokeAdmin,
} from './roomAuthorization.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function loadCtx(prisma, userId, roomId) {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room) throw new RoomError('NOT_FOUND', 'Room not found')
  const [memberRow, banRow] = await Promise.all([
    prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } }),
    prisma.roomBan.findUnique({    where: { userId_roomId: { userId, roomId } } }),
  ])
  return { room, memberRow, banRow, role: resolveRole(userId, room, memberRow, banRow) }
}

export async function joinRoom(prisma, io, userId, roomId) {
  const { room, memberRow, banRow } = await loadCtx(prisma, userId, roomId)
  if (memberRow) throw new RoomError('ALREADY_MEMBER', 'Already a member')
  if (!room.isPublic) throw new RoomError('NOT_FOUND', 'Room not found') // privacy
  if (banRow) throw new RoomError('FORBIDDEN', 'You are banned from this room')

  const member = await prisma.roomMember.create({
    data: { userId, roomId, isAdmin: false },
    include: { user: { select: { id: true, username: true } } },
  })
  emitRoomEvent(io, roomId, 'member_joined', {
    roomId,
    member: { userId: member.userId, username: member.user.username, isAdmin: false, joinedAt: member.joinedAt },
  })
  return member
}

export async function leaveRoom(prisma, io, userId, roomId) {
  const { room, memberRow } = await loadCtx(prisma, userId, roomId)
  if (!memberRow) throw new RoomError('NOT_MEMBER', 'Not a member of this room')
  if (room.ownerId === userId) throw new RoomError('OWNER_CANNOT_LEAVE', 'Owner cannot leave; delete the room instead')
  await prisma.roomMember.delete({ where: { userId_roomId: { userId, roomId } } })
  emitRoomEvent(io, roomId, 'member_left', { roomId, userId })
}

export async function inviteUser(prisma, io, callerId, roomId, { userId: targetId }) {
  const { room, memberRow, role } = await loadCtx(prisma, callerId, roomId)
  // Privacy precedence: non-member on private → 404
  if (!memberRow && !room.isPublic) throw new RoomError('NOT_FOUND', 'Room not found')
  if (room.isPublic) throw new RoomError('WRONG_VISIBILITY', 'Public rooms do not take invitations')
  if (!canInviteToRoom(role, room)) throw new RoomError('FORBIDDEN', 'Only members can invite')
  if (targetId === callerId) throw new RoomError('CANNOT_INVITE_SELF', 'Cannot invite yourself')

  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } })
  if (!target) throw new RoomError('NOT_FOUND', 'User not found')

  const [alreadyMember, alreadyBanned, pending] = await Promise.all([
    prisma.roomMember.findUnique({ where: { userId_roomId: { userId: targetId, roomId } } }),
    prisma.roomBan.findUnique({    where: { userId_roomId: { userId: targetId, roomId } } }),
    prisma.notification.findFirst({
      where: { userId: targetId, type: 'ROOM_INVITE', expiresAt: { gt: new Date() },
        payload: { path: ['roomId'], equals: roomId } },
    }),
  ])
  if (alreadyMember) throw new RoomError('ALREADY_MEMBER', 'User is already a member')
  if (alreadyBanned) throw new RoomError('ALREADY_BANNED', 'User is banned from this room')
  if (pending) throw new RoomError('PENDING_INVITE', 'A pending invitation already exists')

  const caller = await prisma.user.findUnique({ where: { id: callerId }, select: { username: true } })
  const notif = await prisma.notification.create({
    data: {
      userId: targetId,
      type: 'ROOM_INVITE',
      payload: {
        roomId: room.id,
        roomName: room.name,
        invitedByUserId: callerId,
        invitedByUsername: caller.username,
      },
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  })
  return notif
}

export async function acceptInvitation(prisma, io, userId, notificationId) {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notif || notif.userId !== userId || notif.type !== 'ROOM_INVITE') {
    throw new RoomError('NOT_FOUND', 'Invitation not found')
  }
  if (notif.expiresAt <= new Date()) throw new RoomError('INVITE_EXPIRED', 'Invitation expired')

  const roomId = notif.payload.roomId
  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.roomMember.create({
      data: { userId, roomId, isAdmin: false },
      include: { user: { select: { id: true, username: true } } },
    })
    await tx.notification.delete({ where: { id: notificationId } })
    return m
  }).catch((err) => {
    if (err.code === 'P2002') throw new RoomError('ALREADY_MEMBER', 'Already a member')
    throw err
  })
  emitRoomEvent(io, roomId, 'member_joined', {
    roomId,
    member: { userId: member.userId, username: member.user.username, isAdmin: false, joinedAt: member.joinedAt },
  })
}

export async function declineInvitation(prisma, userId, notificationId) {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notif || notif.userId !== userId || notif.type !== 'ROOM_INVITE') {
    throw new RoomError('NOT_FOUND', 'Invitation not found')
  }
  if (notif.expiresAt <= new Date()) throw new RoomError('INVITE_EXPIRED', 'Invitation expired')
  await prisma.notification.delete({ where: { id: notificationId } })
}

export async function removeMember(prisma, io, actorId, roomId, targetId) {
  if (actorId === targetId) throw new RoomError('INVALID_INPUT', 'Use /leave to leave a room you are in')
  const { role: actorRole } = await loadCtx(prisma, actorId, roomId)

  const targetRow = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: targetId, roomId } } })
  if (!targetRow) throw new RoomError('NOT_FOUND', 'Target is not a member')
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  const targetRole = targetId === room.ownerId ? 'owner' : (targetRow.isAdmin ? 'admin' : 'member')

  if (!canRemoveMember(actorRole, targetRole, actorId, targetId)) {
    throw new RoomError('FORBIDDEN', 'Not allowed to remove this member')
  }

  await prisma.$transaction([
    prisma.roomMember.delete({ where: { userId_roomId: { userId: targetId, roomId } } }),
    prisma.roomBan.create({    data: { userId: targetId, roomId, bannedById: actorId } }),
  ])
  emitRoomEvent(io, roomId, 'member_banned', { roomId, userId: targetId, bannedById: actorId })
}

export async function listBans(prisma, callerId, roomId) {
  const { role } = await loadCtx(prisma, callerId, roomId)
  if (!canViewBans(role)) throw new RoomError('FORBIDDEN', 'Only admins can view bans')
  const rows = await prisma.roomBan.findMany({
    where: { roomId },
    include: {
      bannedBy: { select: { id: true, username: true } },
    },
  })
  const userIds = rows.map((r) => r.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, deletedAt: true },
  })
  const userById = Object.fromEntries(users.map((u) => [u.id, u]))
  return rows.map((r) => ({
    userId: r.userId,
    username: userById[r.userId]?.username,
    bannedById: r.bannedById,
    bannedByUsername: r.bannedBy.username,
    bannedAt: r.bannedAt,
  }))
}

export async function unbanUser(prisma, io, callerId, roomId, targetId) {
  const { role } = await loadCtx(prisma, callerId, roomId)
  if (!canUnban(role)) throw new RoomError('FORBIDDEN', 'Only admins can unban')
  try {
    await prisma.roomBan.delete({ where: { userId_roomId: { userId: targetId, roomId } } })
  } catch (err) {
    if (err.code === 'P2025') throw new RoomError('NOT_FOUND', 'User is not banned')
    throw err
  }
  emitRoomEvent(io, roomId, 'member_unbanned', { roomId, userId: targetId })
}

export async function grantAdmin(prisma, io, callerId, roomId, targetId) {
  const { role: actorRole } = await loadCtx(prisma, callerId, roomId)
  if (!canGrantAdmin(actorRole)) throw new RoomError('FORBIDDEN', 'Only admins can grant admin')
  const targetRow = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: targetId, roomId } } })
  if (!targetRow) throw new RoomError('NOT_MEMBER', 'Target must be a member first')
  if (targetRow.isAdmin) throw new RoomError('ALREADY_ADMIN', 'Target is already an admin')
  await prisma.roomMember.update({
    where: { userId_roomId: { userId: targetId, roomId } },
    data: { isAdmin: true },
  })
  emitRoomEvent(io, roomId, 'admin_granted', { roomId, userId: targetId })
}

export async function revokeAdmin(prisma, io, callerId, roomId, targetId) {
  const { room, role: actorRole } = await loadCtx(prisma, callerId, roomId)
  const targetRow = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: targetId, roomId } } })
  if (!targetRow) throw new RoomError('NOT_FOUND', 'Target not found in this room')
  const targetRole = targetId === room.ownerId ? 'owner' : (targetRow.isAdmin ? 'admin' : 'member')
  if (targetRole === 'owner') throw new RoomError('FORBIDDEN', 'Cannot revoke owner admin')
  if (!targetRow.isAdmin) throw new RoomError('NOT_FOUND', 'Target is not an admin')
  if (!canRevokeAdmin(actorRole, targetRole, callerId, targetId)) {
    throw new RoomError('FORBIDDEN', 'Not allowed to revoke admin')
  }
  await prisma.roomMember.update({
    where: { userId_roomId: { userId: targetId, roomId } },
    data: { isAdmin: false },
  })
  emitRoomEvent(io, roomId, 'admin_revoked', { roomId, userId: targetId })
}
