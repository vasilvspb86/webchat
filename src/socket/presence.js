const connections = new Map()  // userId -> Set<socketId>

export function _reset() { connections.clear() }

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
