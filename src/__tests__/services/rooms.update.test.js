import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom, updateRoom } from '../../services/rooms.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function setup() {
  const io = createMockIo()
  const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'o', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'First', isPublic: true })
  return { io, owner, room }
}

describe('updateRoom (group J)', () => {
  it('scenario 59: owner edits name → nameNormalized recomputed + room_updated emitted', async () => {
    const { io, owner, room } = await setup()
    io.reset()
    const updated = await updateRoom(testPrisma, io, owner.id, room.id, { name: 'Second' })
    expect(updated.name).toBe('Second')
    expect(updated.nameNormalized).toBe('second')
    expect(io.emitted).toContainEqual({
      room: `room:${room.id}`, event: 'room_updated',
      payload: { roomId: room.id, fields: { name: 'Second' } },
    })
  })
  it('scenario 61: name collision (case-insensitive) → NAME_TAKEN', async () => {
    const { io, owner, room } = await setup()
    await createRoom(testPrisma, io, owner.id, { name: 'Other', isPublic: true })
    await expect(updateRoom(testPrisma, io, owner.id, room.id, { name: 'OTHER' }))
      .rejects.toMatchObject({ code: 'NAME_TAKEN' })
  })
  it('scenarios 62, 63: visibility flips both directions without touching ban list', async () => {
    const { io, owner, room } = await setup()
    const banned = await testPrisma.user.create({ data: { email: 'b@x', username: 'bb', passwordHash: 'x' } })
    await testPrisma.roomBan.create({ data: { userId: banned.id, roomId: room.id, bannedById: owner.id } })
    const priv = await updateRoom(testPrisma, io, owner.id, room.id, { isPublic: false })
    expect(priv.isPublic).toBe(false)
    const bansStillThere1 = await testPrisma.roomBan.count({ where: { roomId: room.id } })
    expect(bansStillThere1).toBe(1)
    const pub = await updateRoom(testPrisma, io, owner.id, room.id, { isPublic: true })
    expect(pub.isPublic).toBe(true)
    const bansStillThere2 = await testPrisma.roomBan.count({ where: { roomId: room.id } })
    expect(bansStillThere2).toBe(1)
  })
  it('scenario 60: non-owner caller → FORBIDDEN (service-level guard)', async () => {
    const { io, room } = await setup()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'xx', passwordHash: 'x' } })
    await expect(updateRoom(testPrisma, io, other.id, room.id, { name: 'Nope' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
