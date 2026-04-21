import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, deleteAccount } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('deleteAccount', () => {
  let userId, friendId
  beforeEach(async () => {
    await resetDb()
    userId = (await register(testPrisma, creds)).id
    friendId = (await register(testPrisma, { ...creds, email: 'b@b.c', username: 'bob' })).id
    // seed: own room + friend room where user is a message-sender
    const ownRoom = await testPrisma.room.create({ data: { name: 'alices-room', ownerId: userId } })
    await testPrisma.roomMember.create({ data: { userId, roomId: ownRoom.id, isAdmin: true } })
    const bobRoom = await testPrisma.room.create({ data: { name: 'bobs-room', ownerId: friendId } })
    await testPrisma.roomMember.createMany({ data: [
      { userId: friendId, roomId: bobRoom.id, isAdmin: true },
      { userId, roomId: bobRoom.id },
    ]})
    await testPrisma.message.create({ data: { roomId: bobRoom.id, authorId: userId, content: 'hi' } })
    await testPrisma.friendship.create({ data: { requesterId: userId, addresseeId: friendId, status: 'ACCEPTED' } })
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 'a1', sess: { userId }, expire: new Date(Date.now() + 60000) },
      { sid: 'b1', sess: { userId: friendId }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('deletes owned rooms, frees email/username, tombstones fields, keeps messages in others rooms', async () => {
    await deleteAccount(testPrisma, { userId })
    const u = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(u.deletedAt).toBeTruthy()
    expect(u.email).toBe(`deleted-${userId}-a@b.c`)
    expect(u.username).toBe(`deleted-${userId}-alice`)
    expect(await testPrisma.room.count({ where: { name: 'alices-room' } })).toBe(0)
    expect(await testPrisma.room.count({ where: { name: 'bobs-room' } })).toBe(1)
    const msg = await testPrisma.message.findFirst({ where: { authorId: userId } })
    expect(msg).toBeTruthy()                   // frozen, not deleted
    expect(msg.content).toBe('hi')
  })

  it('removes friendship and sessions', async () => {
    await deleteAccount(testPrisma, { userId })
    expect(await testPrisma.friendship.count()).toBe(0)
    const remaining = await testPrisma.user_sessions.findMany()
    expect(remaining.map(r => r.sid)).toEqual(['b1'])
  })

  it('frees original email/username for reuse', async () => {
    await deleteAccount(testPrisma, { userId })
    const reused = await register(testPrisma, creds)
    expect(reused.email).toBe('a@b.c')
    expect(reused.username).toBe('alice')
  })

  it('throws NOT_FOUND for unknown userId', async () => {
    await expect(deleteAccount(testPrisma, { userId: 'does-not-exist' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND on already-deleted user', async () => {
    await deleteAccount(testPrisma, { userId })
    await expect(deleteAccount(testPrisma, { userId }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
