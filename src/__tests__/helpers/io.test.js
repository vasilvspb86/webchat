import { describe, it, expect } from 'vitest'
import { createMockIo } from './io.js'

describe('createMockIo', () => {
  it('records emits scoped by room', () => {
    const io = createMockIo()
    io.to('room:abc').emit('member_joined', { userId: 'u1' })
    io.to('room:abc').emit('member_left',   { userId: 'u2' })
    io.to('room:xyz').emit('room_deleted',  { roomId: 'xyz' })
    expect(io.emitted).toEqual([
      { room: 'room:abc', event: 'member_joined', payload: { userId: 'u1' } },
      { room: 'room:abc', event: 'member_left',   payload: { userId: 'u2' } },
      { room: 'room:xyz', event: 'room_deleted',  payload: { roomId: 'xyz' } },
    ])
  })

  it('reset() clears history', () => {
    const io = createMockIo()
    io.to('room:abc').emit('x', {})
    io.reset()
    expect(io.emitted).toEqual([])
  })
})
