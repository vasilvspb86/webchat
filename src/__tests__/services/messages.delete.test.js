import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom, removeMember } from '../../services/roomMembership.js'
import { createMessage, deleteMessage } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('deleteMessage', () => {
  beforeEach(async () => { await resetDb() })

  it('author can delete own message; content becomes null', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'bye' })
    const res = await deleteMessage(testPrisma, alice.id, m.id)
    expect(res).toEqual({ messageId: m.id, roomId: room.id })
    const after = await testPrisma.message.findUnique({ where: { id: m.id } })
    expect(after.deleted).toBe(true)
    expect(after.content).toBe(null)
  })

  it('admin can delete another user message', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')   // owner
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const bobMsg = await createMessage(testPrisma, bob.id, room.id, { content: 'spam' })
    await deleteMessage(testPrisma, alice.id, bobMsg.id)  // alice is owner
    const after = await testPrisma.message.findUnique({ where: { id: bobMsg.id } })
    expect(after.deleted).toBe(true)
  })

  it('plain member cannot delete another user message', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const aliceMsg = await createMessage(testPrisma, alice.id, room.id, { content: 'hi' })
    await expect(deleteMessage(testPrisma, bob.id, aliceMsg.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects already-deleted with NOT_FOUND', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'x' })
    await deleteMessage(testPrisma, alice.id, m.id)
    await expect(deleteMessage(testPrisma, alice.id, m.id))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('non-member cannot delete a message in a public room', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')   // never joins
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const aliceMsg = await createMessage(testPrisma, alice.id, room.id, { content: 'hi' })
    await expect(deleteMessage(testPrisma, bob.id, aliceMsg.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('banned user cannot delete their own prior message', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')   // owner
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    const bobMsg = await createMessage(testPrisma, bob.id, room.id, { content: 'mine' })
    await removeMember(testPrisma, io, alice.id, room.id, bob.id)  // bans bob
    await expect(deleteMessage(testPrisma, bob.id, bobMsg.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
