import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom } from '../../services/roomMembership.js'
import { createMessage } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('createMessage', () => {
  beforeEach(async () => { await resetDb() })

  it('persists a message for a room member and returns author + reply shape', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const msg = await createMessage(testPrisma, alice.id, room.id, { content: 'hello' })
    expect(msg.content).toBe('hello')
    expect(msg.authorId).toBe(alice.id)
    expect(msg.author.username).toBe('alice')
    expect(msg.replyTo).toBeNull()
  })

  it('throws INVALID_CONTENT on empty content', async () => {
    const alice = await seedUser('alice')
    const io = createMockIo()
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await expect(createMessage(testPrisma, alice.id, room.id, { content: '' }))
      .rejects.toMatchObject({ code: 'INVALID_CONTENT' })
  })

  it('throws INVALID_CONTENT on >3KB content', async () => {
    const alice = await seedUser('alice')
    const io = createMockIo()
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const big = 'a'.repeat(3073)
    await expect(createMessage(testPrisma, alice.id, room.id, { content: big }))
      .rejects.toMatchObject({ code: 'INVALID_CONTENT' })
  })

  it('throws NOT_FOUND on missing room', async () => {
    const alice = await seedUser('alice')
    await expect(createMessage(testPrisma, alice.id, '00000000-0000-0000-0000-000000000000', { content: 'hi' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws FORBIDDEN when caller is not a member of private room', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Private', isPublic: false })
    await expect(createMessage(testPrisma, bob.id, room.id, { content: 'sneaky' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('resolves a valid reply and attaches quoted preview', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const first = await createMessage(testPrisma, alice.id, room.id, { content: 'hi' })
    const reply = await createMessage(testPrisma, bob.id, room.id, { content: 'hey', replyToId: first.id })
    expect(reply.replyTo.id).toBe(first.id)
    expect(reply.replyTo.content).toBe('hi')
    expect(reply.replyTo.author.username).toBe('alice')
  })

  it('throws REPLY_IN_OTHER_ROOM when replyToId is from a different room', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const r1 = await createRoom(testPrisma, io, alice.id, { name: 'Hall',  isPublic: true })
    const r2 = await createRoom(testPrisma, io, alice.id, { name: 'Foyer', isPublic: true })
    const other = await createMessage(testPrisma, alice.id, r2.id, { content: 'over here' })
    await expect(createMessage(testPrisma, alice.id, r1.id, { content: 'huh', replyToId: other.id }))
      .rejects.toMatchObject({ code: 'REPLY_IN_OTHER_ROOM' })
  })
})
