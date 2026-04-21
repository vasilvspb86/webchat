import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { removeMember } from '../../services/roomMembership.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function seed() {
  const io = createMockIo()
  const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
  const admin  = await testPrisma.user.create({ data: { email: 'a@x', username: 'admin', passwordHash: 'x' } })
  const victim = await testPrisma.user.create({ data: { email: 'v@x', username: 'victim', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'rmv', isPublic: true })
  await testPrisma.roomMember.create({ data: { userId: admin.id,  roomId: room.id, isAdmin: true } })
  await testPrisma.roomMember.create({ data: { userId: victim.id, roomId: room.id, isAdmin: false } })
  return { io, owner, admin, victim, room }
}

describe('removeMember (group G)', () => {
  it('scenario 44: admin removes member → RoomMember deleted + RoomBan inserted in one tx + member_banned emitted', async () => {
    const { io, admin, victim, room } = await seed()
    io.reset()
    await removeMember(testPrisma, io, admin.id, room.id, victim.id)
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: victim.id, roomId: room.id } } })).toBeNull()
    const ban = await testPrisma.roomBan.findUnique({ where: { userId_roomId: { userId: victim.id, roomId: room.id } } })
    expect(ban).toMatchObject({ bannedById: admin.id })
    expect(io.emitted.find((e) => e.event === 'member_banned')).toBeTruthy()
  })
  it('scenario 45: admin removes another admin → same behaviour', async () => {
    const { io, admin, room } = await seed()
    const admin2 = await testPrisma.user.create({ data: { email: 'a2@x', username: 'admin2', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: admin2.id, roomId: room.id, isAdmin: true } })
    await removeMember(testPrisma, io, admin.id, room.id, admin2.id)
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: admin2.id, roomId: room.id } } })).toBeNull()
  })
  it('scenario 46: admin cannot remove owner → FORBIDDEN', async () => {
    const { io, admin, owner, room } = await seed()
    await expect(removeMember(testPrisma, io, admin.id, room.id, owner.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 47: admin removing self → OWNER_CANNOT_LEAVE-style guard — "use /leave"', async () => {
    const { io, admin, room } = await seed()
    await expect(removeMember(testPrisma, io, admin.id, room.id, admin.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
  it('scenario 48: plain member tries to remove → FORBIDDEN', async () => {
    const { io, victim, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'x', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: other.id, roomId: room.id, isAdmin: false } })
    await expect(removeMember(testPrisma, io, victim.id, room.id, other.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
