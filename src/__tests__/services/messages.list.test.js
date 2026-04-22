import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { createMessage, listMessages } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('listMessages', () => {
  beforeEach(async () => { await resetDb() })

  it('returns last 50 ascending with nextCursor when more exist', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    for (let i = 0; i < 60; i++) {
      await createMessage(testPrisma, alice.id, room.id, { content: `m${i}` })
    }
    const page1 = await listMessages(testPrisma, alice.id, room.id)
    expect(page1.messages).toHaveLength(50)
    expect(page1.messages[0].content).toBe('m10')
    expect(page1.messages[49].content).toBe('m59')
    expect(page1.nextCursor).toBe(page1.messages[0].id)

    const page2 = await listMessages(testPrisma, alice.id, room.id, { before: page1.nextCursor })
    expect(page2.messages).toHaveLength(10)
    expect(page2.messages[0].content).toBe('m0')
    expect(page2.messages[9].content).toBe('m9')
    expect(page2.nextCursor).toBe(null)
  })

  it('throws FORBIDDEN when caller is not a member', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    await createMessage(testPrisma, alice.id, room.id, { content: 'hi' })
    await expect(listMessages(testPrisma, bob.id, room.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns deleted rows with null content and deleted=true (placeholder)', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Hall', isPublic: true })
    const m = await createMessage(testPrisma, alice.id, room.id, { content: 'secret' })
    await testPrisma.message.update({ where: { id: m.id }, data: { deleted: true, content: null } })
    const page = await listMessages(testPrisma, alice.id, room.id)
    expect(page.messages[0].deleted).toBe(true)
    expect(page.messages[0].content).toBe(null)
  })
})
