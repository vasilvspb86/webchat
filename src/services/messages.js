import { MessageError } from './messageErrors.js'
import { validateMessageContent } from '../utils/validate.js'
import { resolveRole } from './roomAuthorization.js'
import { canEditMessage, canDeleteMessage } from './messageAuthorization.js'

const REPLY_PREVIEW_SELECT = {
  id: true,
  content: true,
  deleted: true,
  author: { select: { id: true, username: true } },
}

async function loadCallerRole(prisma, userId, roomId) {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room) throw new MessageError('NOT_FOUND', 'Room not found')
  const [memberRow, banRow] = await Promise.all([
    prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } }),
    prisma.roomBan.findUnique({    where: { userId_roomId: { userId, roomId } } }),
  ])
  return { room, memberRow, role: resolveRole(userId, room, memberRow, banRow) }
}

export async function createMessage(prisma, userId, roomId, { content, replyToId = null }) {
  const contentErr = validateMessageContent(content)
  if (contentErr) throw new MessageError('INVALID_CONTENT', contentErr)

  const { memberRow } = await loadCallerRole(prisma, userId, roomId)
  if (!memberRow) throw new MessageError('FORBIDDEN', 'Not a member of this room')

  if (replyToId) {
    const ref = await prisma.message.findUnique({ where: { id: replyToId } })
    if (!ref) throw new MessageError('REPLY_NOT_FOUND', 'Reply target not found')
    if (ref.roomId !== roomId) throw new MessageError('REPLY_IN_OTHER_ROOM', 'Reply target is in a different room')
  }

  return prisma.message.create({
    data: { roomId, authorId: userId, content: content.trim(), replyToId: replyToId || null },
    include: {
      author:  { select: { id: true, username: true } },
      replyTo: { select: REPLY_PREVIEW_SELECT },
    },
  })
}

const PAGE_SIZE = 50

export async function listMessages(prisma, userId, roomId, { before = null, limit = PAGE_SIZE } = {}) {
  const { memberRow } = await loadCallerRole(prisma, userId, roomId)
  if (!memberRow) throw new MessageError('FORBIDDEN', 'Not a member of this room')

  let cursorCreatedAt = null
  if (before) {
    const ref = await prisma.message.findUnique({ where: { id: before } })
    if (ref && ref.roomId === roomId) cursorCreatedAt = ref.createdAt
  }

  const rows = await prisma.message.findMany({
    where: { roomId, ...(cursorCreatedAt && { createdAt: { lt: cursorCreatedAt } }) },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      author:  { select: { id: true, username: true } },
      replyTo: { select: REPLY_PREVIEW_SELECT },
    },
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null
  return { messages: page.reverse(), nextCursor }
}

export async function editMessage(prisma, userId, messageId, { content }) {
  const contentErr = validateMessageContent(content)
  if (contentErr) throw new MessageError('INVALID_CONTENT', contentErr)

  const message = await prisma.message.findUnique({ where: { id: messageId } })
  if (!message || message.deleted) throw new MessageError('NOT_FOUND', 'Message not found')
  if (!canEditMessage(userId, message)) throw new MessageError('FORBIDDEN', 'Can only edit your own messages')

  return prisma.message.update({
    where: { id: messageId },
    data: { content: content.trim(), edited: true },
    include: {
      author:  { select: { id: true, username: true } },
      replyTo: { select: REPLY_PREVIEW_SELECT },
    },
  })
}

export async function deleteMessage(prisma, userId, messageId) {
  const message = await prisma.message.findUnique({ where: { id: messageId } })
  if (!message || message.deleted) throw new MessageError('NOT_FOUND', 'Message not found')

  const { role } = await loadCallerRole(prisma, userId, message.roomId)
  if (!canDeleteMessage(role, userId, message)) throw new MessageError('FORBIDDEN', 'Not allowed to delete this message')

  await prisma.message.update({ where: { id: messageId }, data: { deleted: true, content: null } })
  return { messageId, roomId: message.roomId }
}

const UNREAD_CAP = 99

export async function markRead(prisma, userId, roomId, messageId) {
  await prisma.roomMember.updateMany({
    where: { userId, roomId },
    data: { lastReadMessageId: messageId },
  })
}

export async function getUnreadCount(prisma, userId, roomId) {
  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId } },
  })
  if (!member) return { roomId, count: 0 }

  let afterCreatedAt = null
  if (member.lastReadMessageId) {
    const anchor = await prisma.message.findUnique({ where: { id: member.lastReadMessageId } })
    afterCreatedAt = anchor?.createdAt ?? null
  }

  const raw = await prisma.message.count({
    where: {
      roomId,
      deleted: false,
      ...(afterCreatedAt && { createdAt: { gt: afterCreatedAt } }),
    },
  })
  return { roomId, count: Math.min(raw, UNREAD_CAP) }
}
