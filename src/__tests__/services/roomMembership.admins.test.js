import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { grantAdmin, revokeAdmin } from '../../services/roomMembership.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function seed() {
  const io = createMockIo()
  const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
  const admin  = await testPrisma.user.create({ data: { email: 'a@x', username: 'admin', passwordHash: 'x' } })
  const member = await testPrisma.user.create({ data: { email: 'm@x', username: 'member', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'rmv', isPublic: true })
  await testPrisma.roomMember.create({ data: { userId: admin.id,  roomId: room.id, isAdmin: true } })
  await testPrisma.roomMember.create({ data: { userId: member.id, roomId: room.id, isAdmin: false } })
  return { io, owner, admin, member, room }
}

describe('grantAdmin / revokeAdmin (group I)', () => {
  it('scenario 53: admin grants admin to member → isAdmin=true, admin_granted emitted', async () => {
    const { io, admin, member, room } = await seed()
    io.reset()
    await grantAdmin(testPrisma, io, admin.id, room.id, member.id)
    const row = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: member.id, roomId: room.id } } })
    expect(row.isAdmin).toBe(true)
    expect(io.emitted.find((e) => e.event === 'admin_granted')).toBeTruthy()
  })
  it('scenario 54: admin revokes another admin → isAdmin=false, admin_revoked emitted', async () => {
    const { io, owner, admin, room } = await seed()
    io.reset()
    await revokeAdmin(testPrisma, io, owner.id, room.id, admin.id)
    const row = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: admin.id, roomId: room.id } } })
    expect(row.isAdmin).toBe(false)
    expect(io.emitted.find((e) => e.event === 'admin_revoked')).toBeTruthy()
  })
  it('scenario 55: anyone revoking owner\'s admin → FORBIDDEN', async () => {
    const { io, admin, owner, room } = await seed()
    await expect(revokeAdmin(testPrisma, io, admin.id, room.id, owner.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 56: grant to non-member → NOT_MEMBER (→ 404)', async () => {
    const { io, admin, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'x', passwordHash: 'x' } })
    await expect(grantAdmin(testPrisma, io, admin.id, room.id, other.id)).rejects.toMatchObject({ code: 'NOT_MEMBER' })
  })
  it('scenario 57: grant to already-admin → ALREADY_ADMIN', async () => {
    const { io, owner, admin, room } = await seed()
    await expect(grantAdmin(testPrisma, io, owner.id, room.id, admin.id)).rejects.toMatchObject({ code: 'ALREADY_ADMIN' })
  })
  it('scenario 58: revoke admin from plain member → NOT_FOUND (no admin to revoke)', async () => {
    const { io, admin, member, room } = await seed()
    await expect(revokeAdmin(testPrisma, io, admin.id, room.id, member.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 58a: non-owner admin revokes own admin (step down) → 200 + admin_revoked', async () => {
    const { io, admin, room } = await seed()
    io.reset()
    await revokeAdmin(testPrisma, io, admin.id, room.id, admin.id)
    const row = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: admin.id, roomId: room.id } } })
    expect(row.isAdmin).toBe(false)
    expect(io.emitted.find((e) => e.event === 'admin_revoked')).toBeTruthy()
  })
  it('scenario 58b: plain member attempts to grant → FORBIDDEN', async () => {
    const { io, member, room } = await seed()
    const other = await testPrisma.user.create({ data: { email: 'x@x', username: 'x', passwordHash: 'x' } })
    await testPrisma.roomMember.create({ data: { userId: other.id, roomId: room.id, isAdmin: false } })
    await expect(grantAdmin(testPrisma, io, member.id, room.id, other.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('scenario 58c: plain member attempts to revoke → FORBIDDEN', async () => {
    const { io, member, admin, room } = await seed()
    await expect(revokeAdmin(testPrisma, io, member.id, room.id, admin.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
