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

  it('tracks .in(channel).socketsJoin/Leave() in subs', () => {
    const io = createMockIo()
    io.in('user:u1').socketsJoin('room:r1')
    io.in('user:u1').socketsLeave('room:r1')
    expect(io.subs).toEqual([
      { in: 'user:u1', op: 'socketsJoin',  target: 'room:r1' },
      { in: 'user:u1', op: 'socketsLeave', target: 'room:r1' },
    ])
  })

  it('reset() clears subs as well', () => {
    const io = createMockIo()
    io.in('user:u1').socketsJoin('room:r1')
    io.reset()
    expect(io.subs).toEqual([])
  })
})
