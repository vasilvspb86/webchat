import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { joinRoom } from '../../services/roomMembership.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function seedPublic() {
  const io = createMockIo()
  const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
  const joiner = await testPrisma.user.create({ data: { email: 'j@x', username: 'joiner', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'pub', isPublic: true })
  return { io, owner, joiner, room }
}

describe('joinRoom (group D)', () => {
  it('scenario 23: authenticated user joins public → RoomMember + member_joined emitted', async () => {
    const { io, joiner, room } = await seedPublic()
    io.reset()
    await joinRoom(testPrisma, io, joiner.id, room.id)
    const mem = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: joiner.id, roomId: room.id } } })
    expect(mem).toMatchObject({ isAdmin: false })
    expect(io.emitted.find((e) => e.event === 'member_joined')).toBeTruthy()
  })
  it('scenario 24: already a member → ALREADY_MEMBER', async () => {
    const { io, joiner, room } = await seedPublic()
    await joinRoom(testPrisma, io, joiner.id, room.id)
    await expect(joinRoom(testPrisma, io, joiner.id, room.id)).rejects.toMatchObject({ code: 'ALREADY_MEMBER' })
  })
  it('scenario 25: private room without invite → NOT_FOUND (privacy)', async () => {
    const io = createMockIo()
    const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
    const other  = await testPrisma.user.create({ data: { email: 'u@x', username: 'u', passwordHash: 'x' } })
    const room = await createRoom(testPrisma, io, owner.id, { name: 'priv', isPublic: false })
    await expect(joinRoom(testPrisma, io, other.id, room.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 26: banned from public room → FORBIDDEN', async () => {
    const { io, owner, joiner, room } = await seedPublic()
    await testPrisma.roomBan.create({ data: { userId: joiner.id, roomId: room.id, bannedById: owner.id } })
    await expect(joinRoom(testPrisma, io, joiner.id, room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 26a: banned from private room → NOT_FOUND (privacy beats ban feedback)', async () => {
    const io = createMockIo()
    const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
    const other  = await testPrisma.user.create({ data: { email: 'u@x', username: 'u', passwordHash: 'x' } })
    const room = await createRoom(testPrisma, io, owner.id, { name: 'priv', isPublic: false })
    await testPrisma.roomBan.create({ data: { userId: other.id, roomId: room.id, bannedById: owner.id } })
    await expect(joinRoom(testPrisma, io, other.id, room.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('joins the joiner\'s live sockets to the room channel', async () => {
    const { io, joiner, room } = await seedPublic()
    io.reset()
    await joinRoom(testPrisma, io, joiner.id, room.id)
    expect(io.subs).toContainEqual({
      in: `user:${joiner.id}`, op: 'socketsJoin', target: `room:${room.id}`,
    })
  })
})
