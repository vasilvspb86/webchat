import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { listBans, unbanUser } from '../../services/roomMembership.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function seed() {
  const io = createMockIo()
  const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
  const banned = await testPrisma.user.create({ data: { email: 'b@x', username: 'banned', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'rmv', isPublic: true })
  await testPrisma.roomBan.create({ data: { userId: banned.id, roomId: room.id, bannedById: owner.id } })
  return { io, owner, banned, room }
}

describe('listBans + unbanUser (group H)', () => {
  it('scenario 49: admin lists bans → rows with userId, username, bannedById, bannedByUsername, bannedAt', async () => {
    const { owner, banned, room } = await seed()
    const rows = await listBans(testPrisma, owner.id, room.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: banned.id, username: 'banned', bannedById: owner.id, bannedByUsername: 'owner' })
  })
  it('scenario 50: admin unbans → ban row deleted + member_unbanned emitted; user does NOT auto-rejoin', async () => {
    const { io, owner, banned, room } = await seed()
    io.reset()
    await unbanUser(testPrisma, io, owner.id, room.id, banned.id)
    expect(await testPrisma.roomBan.findUnique({ where: { userId_roomId: { userId: banned.id, roomId: room.id } } })).toBeNull()
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: banned.id, roomId: room.id } } })).toBeNull()
    expect(io.emitted.find((e) => e.event === 'member_unbanned')).toBeTruthy()
  })
  it('scenario 51: non-admin → FORBIDDEN', async () => {
    const { io, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'x', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: other.id, roomId: room.id, isAdmin: false } })
    await expect(listBans(testPrisma, other.id, room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(unbanUser(testPrisma, io, other.id, room.id, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 52: unban user who isn\'t banned → NOT_FOUND', async () => {
    const { io, owner, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'n@x', username: 'n', passwordHash: 'x' } })
    await expect(unbanUser(testPrisma, io, owner.id, room.id, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
