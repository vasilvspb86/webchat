import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { leaveRoom } from '../../services/roomMembership.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function seed() {
  const io = createMockIo()
  const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
  const member = await testPrisma.user.create({ data: { email: 'm@x', username: 'm', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'rmv', isPublic: true })
  await testPrisma.roomMember.create({ data: { userId: member.id, roomId: room.id, isAdmin: false } })
  return { io, owner, member, room }
}

describe('leaveRoom (group E)', () => {
  it('scenario 28: member leaves → RoomMember deleted, member_left emitted, NO ban row', async () => {
    const { io, member, room } = await seed()
    io.reset()
    await leaveRoom(testPrisma, io, member.id, room.id)
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: member.id, roomId: room.id } } })).toBeNull()
    expect(await testPrisma.roomBan.findUnique({ where: { userId_roomId: { userId: member.id, roomId: room.id } } })).toBeNull()
    expect(io.emitted.find((e) => e.event === 'member_left')).toBeTruthy()
  })
  it('scenario 29: non-owner admin leaves behaves the same', async () => {
    const { io, room, member } = await seed()
    await testPrisma.roomMember.update({ where: { userId_roomId: { userId: member.id, roomId: room.id } }, data: { isAdmin: true } })
    await leaveRoom(testPrisma, io, member.id, room.id)
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: member.id, roomId: room.id } } })).toBeNull()
  })
  it('scenario 30: owner cannot leave → OWNER_CANNOT_LEAVE', async () => {
    const { io, owner, room } = await seed()
    await expect(leaveRoom(testPrisma, io, owner.id, room.id)).rejects.toMatchObject({ code: 'OWNER_CANNOT_LEAVE' })
  })
  it('scenario 31: non-member → NOT_MEMBER (404 at route)', async () => {
    const { io, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'x', passwordHash: 'x' } })
    await expect(leaveRoom(testPrisma, io, other.id, room.id)).rejects.toMatchObject({ code: 'NOT_MEMBER' })
  })
})
