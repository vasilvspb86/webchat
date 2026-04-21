import { describe, it, expect } from 'vitest'
import { emitRoomEvent } from '../../socket/rooms.js'
import { createMockIo } from '../helpers/io.js'

describe('emitRoomEvent', () => {
  it('emits on room:<roomId>', () => {
    const io = createMockIo()
    emitRoomEvent(io, 'abc', 'member_joined', { userId: 'u1' })
    expect(io.emitted).toEqual([
      { room: 'room:abc', event: 'member_joined', payload: { userId: 'u1' } },
    ])
  })

  it('is a no-op when io is falsy', () => {
    expect(() => emitRoomEvent(null, 'abc', 'x', {})).not.toThrow()
    expect(() => emitRoomEvent(undefined, 'abc', 'x', {})).not.toThrow()
  })
})
