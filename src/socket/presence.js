const connections = new Map()  // userId -> Set<socketId>

export function _reset() { connections.clear() }

// Live check — true iff the user has at least one active socket right now.
// Consumed by listMembers so a fresh page load shows accurate dots without
// waiting for the next presence_update broadcast.
export function isOnline(userId) {
  const set = connections.get(userId)
  return !!(set && set.size > 0)
}

async function broadcastToUserRooms(io, userId, prisma, status) {
  const rooms = await prisma.roomMember.findMany({
    where: { userId },
    select: { roomId: true },
  })
  for (const r of rooms) {
    io.to(`room:${r.roomId}`).emit('presence_update', { userId, status })
  }
}

export async function onConnect(io, socket, prisma) {
  const { userId } = socket
  let set = connections.get(userId)
  if (!set) {
    set = new Set()
    connections.set(userId, set)
  }
  const wasEmpty = set.size === 0
  set.add(socket.id)
  if (wasEmpty) await broadcastToUserRooms(io, userId, prisma, 'online')
}

export async function onDisconnect(io, socket, prisma) {
  const { userId } = socket
  const set = connections.get(userId)
  if (!set) return
  set.delete(socket.id)
  if (set.size === 0) {
    connections.delete(userId)
    await broadcastToUserRooms(io, userId, prisma, 'offline')
  }
}
