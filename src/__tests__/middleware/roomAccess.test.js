import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { requireRoomMember, requireRoomAdmin, requireRoomOwner } from '../../middleware/roomAccess.js'

async function seed({ roomIsPublic = true, callerIsMember = false, callerIsAdmin = false, callerIsOwner = false, callerIsBanned = false } = {}) {
  const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner',  passwordHash: 'x' } })
  const caller = await testPrisma.user.create({ data: { email: 'c@x', username: 'caller', passwordHash: 'x' } })
  const room = await testPrisma.room.create({
    data: {
      name: 'Room', nameNormalized: 'room', description: null, isPublic: roomIsPublic,
      ownerId: callerIsOwner ? caller.id : owner.id,
    },
  })
  await testPrisma.roomMember.create({
    data: { userId: room.ownerId, roomId: room.id, isAdmin: true },
  })
  if (callerIsMember && !callerIsOwner) {
    await testPrisma.roomMember.create({ data: { userId: caller.id, roomId: room.id, isAdmin: callerIsAdmin } })
  }
  if (callerIsBanned) {
    await testPrisma.roomBan.create({ data: { userId: caller.id, roomId: room.id, bannedById: owner.id } })
  }
  return { owner, caller, room }
}

function mkReq({ caller, room }) {
  return { app: { locals: { prisma: testPrisma } }, session: { userId: caller.id }, params: { id: room.id } }
}
function mkRes(resolve) {
  const res = { statusCode: 200, body: null }
  res.status = (s) => { res.statusCode = s; return res }
  res.json = (b) => { res.body = b; if (resolve) resolve(); return res }
  return res
}
function run(mw, req, res) {
  return new Promise((resolve) => {
    res.json = (b) => { res.body = b; resolve(); return res }
    mw(req, res, (err) => resolve(err))
  })
}

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('requireRoomMember', () => {
  it('401 when not authenticated', async () => {
    const res = mkRes()
    const err = await run(requireRoomMember, { app: { locals: { prisma: testPrisma } }, session: {}, params: { id: 'x' } }, res)
    expect(err).toBeUndefined()
    expect(res.statusCode).toBe(401)
  })
  it('404 unknown room', async () => {
    const { caller } = await seed()
    const req = { app: { locals: { prisma: testPrisma } }, session: { userId: caller.id }, params: { id: 'nonexistent-uuid' } }
    const res = mkRes()
    await run(requireRoomMember, req, res)
    expect(res.statusCode).toBe(404)
  })
  it('404 private room, non-member (privacy beats 403)', async () => {
    const { caller, room } = await seed({ roomIsPublic: false, callerIsMember: false })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomMember, req, res)
    expect(res.statusCode).toBe(404)
  })
  it('403 public room, non-member', async () => {
    const { caller, room } = await seed({ roomIsPublic: true, callerIsMember: false })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomMember, req, res)
    expect(res.statusCode).toBe(403)
  })
  it('calls next() + sets req.roomContext when member', async () => {
    const { caller, room } = await seed({ callerIsMember: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    const err = await run(requireRoomMember, req, res)
    expect(err).toBeUndefined()
    expect(req.roomContext.role).toBe('member')
    expect(req.roomContext.room.id).toBe(room.id)
  })
  it('role is owner when caller is owner', async () => {
    const { caller, room } = await seed({ callerIsOwner: true, callerIsMember: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomMember, req, res)
    expect(req.roomContext.role).toBe('owner')
  })
})

describe('requireRoomAdmin', () => {
  it('403 when plain member', async () => {
    const { caller, room } = await seed({ callerIsMember: true, callerIsAdmin: false })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomAdmin, req, res)
    expect(res.statusCode).toBe(403)
  })
  it('passes for admin', async () => {
    const { caller, room } = await seed({ callerIsMember: true, callerIsAdmin: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    const err = await run(requireRoomAdmin, req, res)
    expect(err).toBeUndefined()
    expect(req.roomContext.role).toBe('admin')
  })
  it('passes for owner', async () => {
    const { caller, room } = await seed({ callerIsOwner: true, callerIsMember: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomAdmin, req, res)
    expect(req.roomContext.role).toBe('owner')
  })
})

describe('requireRoomOwner', () => {
  it('403 when admin but not owner', async () => {
    const { caller, room } = await seed({ callerIsMember: true, callerIsAdmin: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomOwner, req, res)
    expect(res.statusCode).toBe(403)
  })
  it('passes for owner', async () => {
    const { caller, room } = await seed({ callerIsOwner: true, callerIsMember: true })
    const req = mkReq({ caller, room }); const res = mkRes()
    await run(requireRoomOwner, req, res)
    expect(req.roomContext.role).toBe('owner')
  })
})
