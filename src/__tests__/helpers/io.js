export function createMockIo() {
  const emitted = []
  const subs = []
  const inApi = (channel) => ({
    emit(event, payload) { emitted.push({ room: channel, event, payload }) },
    socketsJoin(target)  { subs.push({ in: channel, op: 'socketsJoin',  target }) },
    socketsLeave(target) { subs.push({ in: channel, op: 'socketsLeave', target }) },
  })
  return {
    emitted,
    subs,
    to(room) {
      return {
        emit(event, payload) { emitted.push({ room, event, payload }) },
      }
    },
    in: inApi,
    reset() { emitted.length = 0; subs.length = 0 },
  }
}
