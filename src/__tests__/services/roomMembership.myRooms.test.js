import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom, listMyRooms } from '../../services/roomMembership.js'
import { createMessage } from '../../services/messages.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('listMyRooms', () => {
  beforeEach(async () => { await resetDb() })

  it('lists rooms the user is a member of with role flags and recency', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const a = await createRoom(testPrisma, io, alice.id, { name: 'Room A', isPublic: true })
    const b = await createRoom(testPrisma, io, alice.id, { name: 'Room B', isPublic: true })
    const c = await createRoom(testPrisma, io, alice.id, { name: 'Room C', isPublic: true })
    await joinRoom(testPrisma, io, bob.id, a.id)
    await joinRoom(testPrisma, io, bob.id, b.id)
    // c: bob not a member
    await createMessage(testPrisma, alice.id, b.id, { content: 'recent' })

    const rooms = await listMyRooms(testPrisma, bob.id)
    expect(rooms.map(r => r.name)).toEqual(['Room B', 'Room A'])
    expect(rooms[0].isAdmin).toBe(false)
    expect(rooms[0].isOwner).toBe(false)
    expect(rooms[0].lastMessageAt).toBeInstanceOf(Date)
    expect(rooms[1].lastMessageAt).toBe(null)
    // c was not a member
    expect(rooms.map(r => r.name)).not.toContain('Room C')
    // silence unused var for c
    expect(c.id).toBeTruthy()
  })

  it('marks owner and admin correctly', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Room X', isPublic: true })
    const rooms = await listMyRooms(testPrisma, alice.id)
    expect(rooms[0].isOwner).toBe(true)
    expect(rooms[0].isAdmin).toBe(true)
    expect(rooms[0].id).toBe(room.id)
  })
})
