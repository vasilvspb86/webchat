import { describe, it, expect, beforeEach, vi } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom } from '../../services/roomMembership.js'
import { createMessage } from '../../services/messages.js'
import * as handlers from '../../socket/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

function fakeSocket(userId) {
  return { userId, emit: vi.fn(), to: vi.fn((_room) => ({ emit: vi.fn() })) }
}

describe('socket messages handlers', () => {
  beforeEach(async () => { await resetDb() })

  it('sendMessage persists and emits new_message to room:<id>', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    io.reset()
    const socket = fakeSocket(alice.id)
    await handlers.sendMessage(io, socket, testPrisma, { roomId: room.id, content: 'hi' })

    const newMessageEmits = io.emitted.filter((e) => e.event === 'new_message')
    expect(newMessageEmits).toHaveLength(1)
    expect(newMessageEmits[0].room).toBe(`room:${room.id}`)
    expect(newMessageEmits[0].payload.content).toBe('hi')

    const unread = io.emitted.filter((e) => e.event === 'unread_count')
    expect(unread).toHaveLength(1)            // only bob gets it; alice is the sender
    expect(unread[0].room).toBe(`user:${bob.id}`)
    expect(unread[0].payload).toEqual({ roomId: room.id, count: 1 })
  })

  it('sendMessage emits error on validation failure', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    io.reset()
    const socket = fakeSocket(alice.id)
    await handlers.sendMessage(io, socket, testPrisma, { roomId: room.id, content: '' })
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'INVALID_CONTENT' }))
    expect(io.emitted.filter((e) => e.event === 'new_message')).toHaveLength(0)
  })

  it('editMessage emits message_edited', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'x' })
    io.reset()
    const socket = fakeSocket(alice.id)
    await handlers.editMessage(io, socket, testPrisma, { messageId: m.id, content: 'y' })
    const e = io.emitted.filter((x) => x.event === 'message_edited')
    expect(e).toHaveLength(1)
    expect(e[0].room).toBe(`room:${room.id}`)
    expect(e[0].payload).toEqual({ messageId: m.id, content: 'y' })
  })

  it('deleteMessage emits message_deleted', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'x' })
    io.reset()
    const socket = fakeSocket(alice.id)
    await handlers.deleteMessage(io, socket, testPrisma, { messageId: m.id })
    const e = io.emitted.filter((x) => x.event === 'message_deleted')
    expect(e).toHaveLength(1)
    expect(e[0].payload).toEqual({ messageId: m.id })
  })

  it('typingStart emits to room via socket.to, not io.to', async () => {
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, createMockIo(), alice.id, { name: 'Hall', isPublic: true })
    const emit = vi.fn()
    const socket = { userId: alice.id, to: vi.fn(() => ({ emit })), emit: vi.fn() }
    handlers.typingStart(/*io*/null, socket, { roomId: room.id })
    expect(socket.to).toHaveBeenCalledWith(`room:${room.id}`)
    expect(emit).toHaveBeenCalledWith('typing_start', { userId: alice.id, roomId: room.id })
  })
})
