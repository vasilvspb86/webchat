import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom, getRoom, listMembers } from '../../services/rooms.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function setup({ isPublic }) {
  const io = createMockIo()
  const owner  = await testPrisma.user.create({ data: { email: 'o@x',  username: 'owner',  passwordHash: 'x' } })
  const member = await testPrisma.user.create({ data: { email: 'm@x',  username: 'member', passwordHash: 'x' } })
  const stranger = await testPrisma.user.create({ data: { email: 's@x', username: 'stranger', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'room1', isPublic })
  await testPrisma.roomMember.create({ data: { userId: member.id, roomId: room.id, isAdmin: false } })
  return { owner, member, stranger, room }
}

describe('getRoom (group C)', () => {
  it('scenario 18: member of private room gets full info', async () => {
    const { member, room } = await setup({ isPublic: false })
    const r = await getRoom(testPrisma, member.id, room.id)
    expect(r).toMatchObject({ id: room.id, name: 'room1', isPublic: false, memberCount: 2 })
  })
  it('scenario 19: non-member of private room → NOT_FOUND', async () => {
    const { stranger, room } = await setup({ isPublic: false })
    await expect(getRoom(testPrisma, stranger.id, room.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 20: non-member of public room gets full info', async () => {
    const { stranger, room } = await setup({ isPublic: true })
    const r = await getRoom(testPrisma, stranger.id, room.id)
    expect(r.id).toBe(room.id)
  })
  it('scenario 21: unknown id → NOT_FOUND', async () => {
    const { member } = await setup({ isPublic: true })
    await expect(getRoom(testPrisma, member.id, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('listMembers', () => {
  it('orders owner first, then admins, then members (username within group)', async () => {
    const { room, owner } = await setup({ isPublic: true })
    const a = await testPrisma.user.create({ data: { email: 'a@x', username: 'alice-admin', passwordHash: 'x' } })
    const b = await testPrisma.user.create({ data: { email: 'b@x', username: 'bob-member', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: a.id, roomId: room.id, isAdmin: true } })
    await testPrisma.roomMember.create({ data: { userId: b.id, roomId: room.id, isAdmin: false } })
    const rows = await listMembers(testPrisma, room.id)
    expect(rows[0]).toMatchObject({ userId: owner.id, isOwner: true })
    expect(rows.map((r) => r.username)).toEqual(['owner', 'alice-admin', 'bob-member', 'member'].sort((x, y) => {
      const rank = (u) => u === 'owner' ? 0 : (u === 'alice-admin' ? 1 : 2)
      return rank(x) - rank(y) || x.localeCompare(y)
    }))
  })
  it('scenarios 43a / 76: excludes soft-deleted users', async () => {
    const { room } = await setup({ isPublic: true })
    const ghost = await testPrisma.user.create({ data: { email: 'g@x', username: 'ghost', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: ghost.id, roomId: room.id, isAdmin: false } })
    await testPrisma.user.update({ where: { id: ghost.id }, data: { deletedAt: new Date(), username: `deleted-${ghost.id}-ghost` } })
    const rows = await listMembers(testPrisma, room.id)
    expect(rows.some((r) => r.userId === ghost.id)).toBe(false)
  })
})
