export function emitRoomEvent(io, roomId, event, payload) {
  if (!io) return
  io.to(`room:${roomId}`).emit(event, payload)
}
