import { describe, it, expect, vi } from 'vitest'
import { initSocket } from '../../socket/index.js'

function mockSocket(userId, joinRoom) {
  return {
    userId,
    join: vi.fn((name) => joinRoom.push(name)),
    on: vi.fn(),
    emit: vi.fn(),
  }
}

describe('initSocket', () => {
  it('joins sockets to room:${roomId} (not bare roomId) for every membership', async () => {
    const joined = []
    const prisma = {
      roomMember: { findMany: vi.fn().mockResolvedValue([{ roomId: 'R1' }, { roomId: 'R2' }]) },
      notification: { findMany: vi.fn().mockResolvedValue([]) },
    }
    let connHandler
    const io = { use: vi.fn(), on: vi.fn((ev, h) => { if (ev === 'connection') connHandler = h }) }
    initSocket(io, prisma)
    const socket = mockSocket('U1', joined)
    await connHandler(socket)
    expect(joined).toContain('room:R1')
    expect(joined).toContain('room:R2')
    expect(joined).toContain('user:U1')
    expect(joined).not.toContain('R1')
    expect(joined).not.toContain('R2')
  })
})
