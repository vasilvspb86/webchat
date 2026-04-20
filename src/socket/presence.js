const HEARTBEAT_TIMEOUT_MS = 15_000
const heartbeatTimers = new Map()

function broadcastPresence(io, userId, status) {
  io.emit('presence_update', { userId, status })
}

export function onConnect(io, presence, socket) {
  const { userId } = socket
  if (!presence.has(userId)) {
    presence.set(userId, { status: 'online', sockets: new Set(), lastSeen: new Date() })
  }
  const entry = presence.get(userId)
  entry.sockets.add(socket.id)
  entry.status = 'online'
  entry.lastSeen = new Date()
  broadcastPresence(io, userId, 'online')
  scheduleHeartbeatTimeout(io, presence, socket)
}

export function onHeartbeat(presence, socket) {
  const entry = presence.get(socket.userId)
  if (entry) entry.lastSeen = new Date()
  clearTimeout(heartbeatTimers.get(socket.id))
}

export function onAfk(io, presence, socket, idle) {
  const { userId } = socket
  const entry = presence.get(userId)
  if (!entry) return
  const newStatus = idle ? 'afk' : 'online'
  if (entry.status !== newStatus) {
    entry.status = newStatus
    broadcastPresence(io, userId, newStatus)
  }
}

export function onDisconnect(io, presence, socket) {
  const { userId } = socket
  const entry = presence.get(userId)
  if (!entry) return
  clearTimeout(heartbeatTimers.get(socket.id))
  heartbeatTimers.delete(socket.id)
  entry.sockets.delete(socket.id)
  if (entry.sockets.size === 0) {
    broadcastPresence(io, userId, 'offline')
    presence.delete(userId)
  }
}

function scheduleHeartbeatTimeout(io, presence, socket) {
  clearTimeout(heartbeatTimers.get(socket.id))
  heartbeatTimers.set(socket.id, setTimeout(() => onDisconnect(io, presence, socket), HEARTBEAT_TIMEOUT_MS))
}
