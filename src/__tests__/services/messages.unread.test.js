import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom } from '../../services/roomMembership.js'
import { createMessage, markRead, getUnreadCount } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('markRead + getUnreadCount', () => {
  beforeEach(async () => { await resetDb() })

  it('counts all messages when never read; caps at 99', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    for (let i = 0; i < 120; i++) await createMessage(testPrisma, alice.id, room.id, { content: `m${i}` })
    const { count } = await getUnreadCount(testPrisma, bob.id, room.id)
    expect(count).toBe(99)
  })

  it('markRead advances lastReadMessageId and zeroes the count', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const last = await createMessage(testPrisma, alice.id, room.id, { content: 'last' })
    await markRead(testPrisma, bob.id, room.id, last.id)
    const { count } = await getUnreadCount(testPrisma, bob.id, room.id)
    expect(count).toBe(0)
  })

  it('ignores deleted messages in the unread count', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const m1 = await createMessage(testPrisma, alice.id, room.id, { content: 'one' })
    await createMessage(testPrisma, alice.id, room.id, { content: 'two' })
    await testPrisma.message.update({ where: { id: m1.id }, data: { deleted: true, content: null } })
    const { count } = await getUnreadCount(testPrisma, bob.id, room.id)
    expect(count).toBe(1)
  })

  it('returns 0 for non-members', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const carol = await seedUser('carol')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await createMessage(testPrisma, alice.id, room.id, { content: 'hi' })
    const { count } = await getUnreadCount(testPrisma, carol.id, room.id)
    expect(count).toBe(0)
  })
})
