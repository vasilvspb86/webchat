import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom, deleteRoom, getRoom } from '../../services/rooms.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('deleteRoom (group K)', () => {
  it('scenario 64: owner deletes → rows cascade, room_deleted emitted AFTER commit', async () => {
    const io = createMockIo()
    const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
    const member = await testPrisma.user.create({ data: { email: 'm@x', username: 'm', passwordHash: 'x' } })
    const room = await createRoom(testPrisma, io, owner.id, { name: 'room', isPublic: true })
    await testPrisma.roomMember.create({ data: { userId: member.id, roomId: room.id, isAdmin: false } })
    await testPrisma.message.create({ data: { roomId: room.id, authorId: owner.id, content: 'hi' } })
    io.reset()

    await deleteRoom(testPrisma, io, owner.id, room.id)

    expect(await testPrisma.room.findUnique({ where: { id: room.id } })).toBeNull()
    expect(await testPrisma.roomMember.count({ where: { roomId: room.id } })).toBe(0)
    expect(await testPrisma.message.count({ where: { roomId: room.id } })).toBe(0)
    expect(io.emitted).toContainEqual({
      room: `room:${room.id}`, event: 'room_deleted', payload: { roomId: room.id },
    })
    await expect(getRoom(testPrisma, owner.id, room.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 65: non-owner (admin) → FORBIDDEN', async () => {
    const io = createMockIo()
    const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
    const admin = await testPrisma.user.create({ data: { email: 'a@x', username: 'a', passwordHash: 'x' } })
    const room = await createRoom(testPrisma, io, owner.id, { name: 'room', isPublic: true })
    await testPrisma.roomMember.create({ data: { userId: admin.id, roomId: room.id, isAdmin: true } })
    await expect(deleteRoom(testPrisma, io, admin.id, room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 66: transaction rollback → no socket event (Prisma foreign key failure simulated via unknown id)', async () => {
    const io = createMockIo()
    const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
    await expect(deleteRoom(testPrisma, io, owner.id, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(io.emitted).toEqual([])
  })
})
