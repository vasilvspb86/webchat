import { requireSocketAuth } from '../middleware/auth.js'
import * as presenceHandlers from './presence.js'
import * as messageHandlers from './messages.js'

const presence = new Map()

export function initSocket(io, prisma) {
  io.use(requireSocketAuth)

  io.on('connection', async (socket) => {
    const { userId } = socket

    socket.join(`user:${userId}`)
    presenceHandlers.onConnect(io, presence, socket)

    const memberships = await prisma.roomMember.findMany({ where: { userId } })
    for (const m of memberships) socket.join(m.roomId)

    const pending = await prisma.notification.findMany({ where: { userId, read: false, expiresAt: { gt: new Date() } } })
    if (pending.length > 0) socket.emit('pending_notifications', pending)

    socket.on('send_message', (data) => messageHandlers.sendMessage(io, socket, prisma, data))
    socket.on('edit_message', (data) => messageHandlers.editMessage(io, socket, prisma, data))
    socket.on('delete_message', (data) => messageHandlers.deleteMessage(io, socket, prisma, data))
    socket.on('mark_read', (data) => messageHandlers.markRead(socket, prisma, data))
    socket.on('typing_start', ({ roomId }) => socket.to(roomId).emit('typing_start', { userId, roomId }))
    socket.on('typing_stop', ({ roomId }) => socket.to(roomId).emit('typing_stop', { userId, roomId }))
    socket.on('heartbeat', () => presenceHandlers.onHeartbeat(presence, socket))
    socket.on('afk', ({ idle }) => presenceHandlers.onAfk(io, presence, socket, idle))
    socket.on('join_room', ({ roomId }) => socket.join(roomId))
    socket.on('leave_room', ({ roomId }) => socket.leave(roomId))
    socket.on('disconnect', () => presenceHandlers.onDisconnect(io, presence, socket))
  })
}
