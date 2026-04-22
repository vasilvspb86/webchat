import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'

async function mkUser(email = 'u@x', username = 'u') {
  return testPrisma.user.create({ data: { email, username, passwordHash: 'x' } })
}

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('createRoom (group A)', () => {
  it('scenario 1: creates room + owner RoomMember with isAdmin=true in one tx', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    const room = await createRoom(testPrisma, io, owner.id, { name: 'general', description: 'hi', isPublic: true })
    expect(room).toMatchObject({ name: 'general', nameNormalized: 'general', description: 'hi', isPublic: true, ownerId: owner.id })
    const member = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: owner.id, roomId: room.id } } })
    expect(member).toMatchObject({ isAdmin: true })
  })
  it('scenarios 4, 5: name collision (case-insensitive) → NAME_TAKEN', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    await createRoom(testPrisma, io, owner.id, { name: 'General', isPublic: true })
    await expect(createRoom(testPrisma, io, owner.id, { name: 'general', isPublic: true })).rejects.toMatchObject({ code: 'NAME_TAKEN' })
    await expect(createRoom(testPrisma, io, owner.id, { name: 'GENERAL', isPublic: true })).rejects.toMatchObject({ code: 'NAME_TAKEN' })
  })
  it('scenario 6: trims whitespace before uniqueness check and before storage', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    const room = await createRoom(testPrisma, io, owner.id, { name: '   Spaces   ', isPublic: true })
    expect(room.name).toBe('Spaces')
    expect(room.nameNormalized).toBe('spaces')
    await expect(createRoom(testPrisma, io, owner.id, { name: 'spaces', isPublic: true })).rejects.toMatchObject({ code: 'NAME_TAKEN' })
  })
  it('scenarios 7, 9: invalid name → INVALID_NAME', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    await expect(createRoom(testPrisma, io, owner.id, { name: '', isPublic: true })).rejects.toMatchObject({ code: 'INVALID_NAME' })
    await expect(createRoom(testPrisma, io, owner.id, { name: 'ab', isPublic: true })).rejects.toMatchObject({ code: 'INVALID_NAME' })
    await expect(createRoom(testPrisma, io, owner.id, { name: 'x'.repeat(51), isPublic: true })).rejects.toMatchObject({ code: 'INVALID_NAME' })
  })
  it('scenario 8: description > 500 → INVALID_DESCRIPTION', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    await expect(createRoom(testPrisma, io, owner.id, { name: 'okay', description: 'x'.repeat(501), isPublic: true }))
      .rejects.toMatchObject({ code: 'INVALID_DESCRIPTION' })
  })
  it('scenarios 2, 3: isPublic defaults / respects input', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    const pub = await createRoom(testPrisma, io, owner.id, { name: 'pub' })
    expect(pub.isPublic).toBe(true)
    const priv = await createRoom(testPrisma, io, owner.id, { name: 'priv', isPublic: false })
    expect(priv.isPublic).toBe(false)
  })
  it('joins creator\'s live sockets to the room channel so realtime reaches them', async () => {
    const io = createMockIo()
    const owner = await mkUser()
    const room = await createRoom(testPrisma, io, owner.id, { name: 'gen', isPublic: true })
    expect(io.subs).toContainEqual({
      in: `user:${owner.id}`, op: 'socketsJoin', target: `room:${room.id}`,
    })
  })
})
