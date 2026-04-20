const { requireSocketAuth } = require('../middleware/auth')
const presenceHandlers = require('./presence')
const messageHandlers = require('./messages')

// In-memory presence map: userId -> { status, sockets: Set }
const presence = new Map()

module.exports = function initSocket(io, prisma) {
  io.use(requireSocketAuth)

  io.on('connection', async (socket) => {
    const userId = socket.userId

    // Join personal room for direct notifications
    socket.join(`user:${userId}`)

    // Initialize presence
    presenceHandlers.onConnect(io, presence, socket, prisma)

    // Join all user's rooms
    const memberships = await prisma.roomMember.findMany({ where: { userId } })
    for (const m of memberships) socket.join(m.roomId)

    // Push any pending notifications on connect
    const pending = await prisma.notification.findMany({
      where: { userId, read: false, expiresAt: { gt: new Date() } },
    })
    if (pending.length > 0) socket.emit('pending_notifications', pending)

    // Message events
    socket.on('send_message', (data) => messageHandlers.sendMessage(io, socket, prisma, data))
    socket.on('edit_message', (data) => messageHandlers.editMessage(io, socket, prisma, data))
    socket.on('delete_message', (data) => messageHandlers.deleteMessage(io, socket, prisma, data))
    socket.on('mark_read', (data) => messageHandlers.markRead(socket, prisma, data))
    socket.on('typing_start', ({ roomId }) => socket.to(roomId).emit('typing_start', { userId, roomId }))
    socket.on('typing_stop', ({ roomId }) => socket.to(roomId).emit('typing_stop', { userId, roomId }))

    // Presence events
    socket.on('heartbeat', () => presenceHandlers.onHeartbeat(presence, socket))
    socket.on('afk', ({ idle }) => presenceHandlers.onAfk(io, presence, socket, idle))

    // Join a room (after joining via REST)
    socket.on('join_room', ({ roomId }) => socket.join(roomId))
    socket.on('leave_room', ({ roomId }) => socket.leave(roomId))

    socket.on('disconnect', () => presenceHandlers.onDisconnect(io, presence, socket))
  })
}
