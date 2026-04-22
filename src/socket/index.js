import { requireSocketAuth } from '../middleware/auth.js'
import * as presenceHandlers from './presence.js'
import * as messageHandlers from './messages.js'

export function initSocket(io, prisma) {
  io.use(requireSocketAuth)

  io.on('connection', async (socket) => {
    const { userId } = socket

    socket.join(`user:${userId}`)

    const memberships = await prisma.roomMember.findMany({ where: { userId } })
    for (const m of memberships) socket.join(`room:${m.roomId}`)

    presenceHandlers.onConnect(io, socket, prisma)

    const pending = await prisma.notification.findMany({
      where: { userId, read: false, expiresAt: { gt: new Date() } },
    })
    if (pending.length > 0) socket.emit('pending_notifications', pending)

    socket.on('send_message',   (data) => messageHandlers.sendMessage(io, socket, prisma, data))
    socket.on('edit_message',   (data) => messageHandlers.editMessage(io, socket, prisma, data))
    socket.on('delete_message', (data) => messageHandlers.deleteMessage(io, socket, prisma, data))
    socket.on('mark_read',      (data) => messageHandlers.markRead(socket, prisma, data))
    socket.on('typing_start',   (data) => messageHandlers.typingStart(io, socket, data))
    socket.on('typing_stop',    (data) => messageHandlers.typingStop(io, socket, data))
    socket.on('join_room',      ({ roomId }) => socket.join(`room:${roomId}`))
    socket.on('leave_room',     ({ roomId }) => socket.leave(`room:${roomId}`))
    socket.on('disconnect',     () => presenceHandlers.onDisconnect(io, socket, prisma))
  })
}
