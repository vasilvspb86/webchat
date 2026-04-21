export function createMockIo() {
  const emitted = []
  return {
    emitted,
    to(room) {
      return {
        emit(event, payload) { emitted.push({ room, event, payload }) },
      }
    },
    reset() { emitted.length = 0 },
  }
}
