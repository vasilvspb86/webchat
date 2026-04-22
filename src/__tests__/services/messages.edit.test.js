import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom, grantAdmin } from '../../services/roomMembership.js'
import { createMessage, editMessage } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('editMessage', () => {
  beforeEach(async () => { await resetDb() })

  it('author can edit own non-deleted message; sets edited=true', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'origin' })
    const updated = await editMessage(testPrisma, alice.id, m.id, { content: 'revised' })
    expect(updated.content).toBe('revised')
    expect(updated.edited).toBe(true)
  })

  it('rejects non-author even if admin', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, room.id)
    await grantAdmin(testPrisma, io, alice.id, room.id, bob.id)
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'origin' })
    await expect(editMessage(testPrisma, bob.id, m.id, { content: 'hijack' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects editing a deleted message with NOT_FOUND', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'x' })
    await testPrisma.message.update({ where: { id: m.id }, data: { deleted: true, content: null } })
    await expect(editMessage(testPrisma, alice.id, m.id, { content: 'y' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects INVALID_CONTENT', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'x' })
    await expect(editMessage(testPrisma, alice.id, m.id, { content: '' }))
      .rejects.toMatchObject({ code: 'INVALID_CONTENT' })
  })
})
