import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { deleteAccount } from '../../services/auth.js'
import { createRoom } from '../../services/rooms.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('deleteAccount cross-spec: emit room_deleted per owned room', () => {
  it('emits room_deleted once per owned room AFTER commit', async () => {
    const io = createMockIo()
    const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
    const r1 = await createRoom(testPrisma, io, owner.id, { name: 'room-a', isPublic: true })
    const r2 = await createRoom(testPrisma, io, owner.id, { name: 'room-b', isPublic: false })
    io.reset()
    await deleteAccount(testPrisma, { userId: owner.id }, { io })
    const events = io.emitted.filter((e) => e.event === 'room_deleted').map((e) => e.payload.roomId).sort()
    expect(events).toEqual([r1.id, r2.id].sort())
    expect(await testPrisma.room.count({ where: { ownerId: owner.id } })).toBe(0)
  })
  it('no broadcast if user does not exist', async () => {
    const io = createMockIo()
    await expect(deleteAccount(testPrisma, { userId: '00000000-0000-0000-0000-000000000000' }, { io })).rejects.toBeDefined()
    expect(io.emitted.filter((e) => e.event === 'room_deleted')).toEqual([])
  })
})
