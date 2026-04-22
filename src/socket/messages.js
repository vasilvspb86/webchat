import {
  createMessage, editMessage as editMessageSvc, deleteMessage as deleteMessageSvc,
  markRead as markReadSvc, getUnreadCount,
} from '../services/messages.js'

function emitRoom(io, roomId, event, payload) { io.to(`room:${roomId}`).emit(event, payload) }
function emitUser(io, userId, event, payload) { io.to(`user:${userId}`).emit(event, payload) }

async function fanoutUnread(io, prisma, roomId, excludeUserId) {
  const others = await prisma.roomMember.findMany({
    where: { roomId, NOT: { userId: excludeUserId } },
    select: { userId: true },
  })
  await Promise.all(others.map(async (m) => {
    const { count } = await getUnreadCount(prisma, m.userId, roomId)
    emitUser(io, m.userId, 'unread_count', { roomId, count })
  }))
}

export async function sendMessage(io, socket, prisma, { roomId, content, replyToId } = {}) {
  try {
    const message = await createMessage(prisma, socket.userId, roomId, { content, replyToId })
    emitRoom(io, roomId, 'new_message', message)
    await fanoutUnread(io, prisma, roomId, socket.userId)
  } catch (err) {
    if (err?.code) return socket.emit('error', { code: err.code, message: err.message })
    console.error('sendMessage error', err)
    socket.emit('error', { code: 'INTERNAL', message: 'Failed to send message' })
  }
}

export async function editMessage(io, socket, prisma, { messageId, content } = {}) {
  try {
    const updated = await editMessageSvc(prisma, socket.userId, messageId, { content })
    emitRoom(io, updated.roomId, 'message_edited', { messageId: updated.id, content: updated.content })
  } catch (err) {
    if (err?.code) return socket.emit('error', { code: err.code, message: err.message })
    console.error('editMessage error', err)
  }
}

export async function deleteMessage(io, socket, prisma, { messageId } = {}) {
  try {
    const { roomId } = await deleteMessageSvc(prisma, socket.userId, messageId)
    emitRoom(io, roomId, 'message_deleted', { messageId })
  } catch (err) {
    if (err?.code) return socket.emit('error', { code: err.code, message: err.message })
    console.error('deleteMessage error', err)
  }
}

export async function markRead(socket, prisma, { roomId, messageId } = {}) {
  try {
    await markReadSvc(prisma, socket.userId, roomId, messageId)
  } catch (err) { console.error('markRead error', err) }
}

export function typingStart(_io, socket, { roomId } = {}) {
  if (!roomId) return
  socket.to(`room:${roomId}`).emit('typing_start', { userId: socket.userId, roomId })
}

export function typingStop(_io, socket, { roomId } = {}) {
  if (!roomId) return
  socket.to(`room:${roomId}`).emit('typing_stop', { userId: socket.userId, roomId })
}
