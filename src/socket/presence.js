// presence map: userId -> { status: 'online'|'afk'|'offline', sockets: Set<socketId>, lastSeen: Date }

const HEARTBEAT_TIMEOUT_MS = 15_000 // 15s without heartbeat → offline
const heartbeatTimers = new Map() // socketId -> NodeJS.Timeout

function broadcastPresence(io, presence, userId, status) {
  io.emit('presence_update', { userId, status })
}

function getEffectiveStatus(entry) {
  if (!entry || entry.sockets.size === 0) return 'offline'
  return entry.status // 'online' or 'afk'
}

function onConnect(io, presence, socket, prisma) {
  const userId = socket.userId
  if (!presence.has(userId)) {
    presence.set(userId, { status: 'online', sockets: new Set(), lastSeen: new Date() })
  }
  const entry = presence.get(userId)
  entry.sockets.add(socket.id)
  entry.status = 'online'
  entry.lastSeen = new Date()
  broadcastPresence(io, presence, userId, 'online')
  scheduleHeartbeatTimeout(io, presence, socket)
}

function onHeartbeat(presence, socket) {
  const userId = socket.userId
  const entry = presence.get(userId)
  if (entry) entry.lastSeen = new Date()
  scheduleHeartbeatTimeout(presence._io, presence, socket)
  // Reset heartbeat timer
  clearTimeout(heartbeatTimers.get(socket.id))
}

function onAfk(io, presence, socket, idle) {
  const userId = socket.userId
  const entry = presence.get(userId)
  if (!entry) return

  if (idle) {
    // This tab went idle — check if all tabs are idle
    const allIdle = true // BroadcastChannel coordination happens client-side
    // Client sends afk only when all tabs are idle (via BroadcastChannel)
    if (entry.status !== 'afk') {
      entry.status = 'afk'
      broadcastPresence(io, presence, userId, 'afk')
    }
  } else {
    // Tab became active again
    if (entry.status !== 'online') {
      entry.status = 'online'
      broadcastPresence(io, presence, userId, 'online')
    }
  }
}

function onDisconnect(io, presence, socket) {
  const userId = socket.userId
  const entry = presence.get(userId)
  if (!entry) return

  clearTimeout(heartbeatTimers.get(socket.id))
  heartbeatTimers.delete(socket.id)
  entry.sockets.delete(socket.id)

  if (entry.sockets.size === 0) {
    entry.status = 'offline'
    broadcastPresence(io, presence, userId, 'offline')
    presence.delete(userId)
  }
}

function scheduleHeartbeatTimeout(io, presence, socket) {
  clearTimeout(heartbeatTimers.get(socket.id))
  const timer = setTimeout(() => {
    // No heartbeat received — treat as offline
    onDisconnect(io, presence, socket)
  }, HEARTBEAT_TIMEOUT_MS)
  heartbeatTimers.set(socket.id, timer)
}

module.exports = { onConnect, onHeartbeat, onAfk, onDisconnect }
