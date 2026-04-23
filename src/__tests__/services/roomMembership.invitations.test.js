import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom } from '../../services/rooms.js'
import { inviteUser, acceptInvitation, declineInvitation } from '../../services/roomMembership.js'
import { onConnect, _reset as resetPresence } from '../../socket/presence.js'

beforeEach(async () => { await resetDb(); resetPresence() })
afterAll(() => testPrisma.$disconnect())

async function seedPrivate() {
  const io = createMockIo()
  const owner = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
  const guest = await testPrisma.user.create({ data: { email: 'g@x', username: 'guest', passwordHash: 'x' } })
  const room = await createRoom(testPrisma, io, owner.id, { name: 'priv', isPublic: false })
  return { io, owner, guest, room }
}

describe('inviteUser / accept / decline (group F)', () => {
  it('scenario 32: member invites non-member → Notification row with correct payload, 7-day TTL', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    expect(notif).toMatchObject({ userId: guest.id, type: 'ROOM_INVITE' })
    expect(notif.payload).toMatchObject({ roomId: room.id, roomName: 'priv', invitedByUserId: owner.id, invitedByUsername: 'owner' })
    const ttlMs = new Date(notif.expiresAt).getTime() - Date.now()
    expect(ttlMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
    expect(ttlMs).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })
  it('scenario 33: accept → RoomMember created, notification deleted, member_joined emitted', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    io.reset()
    await acceptInvitation(testPrisma, io, guest.id, notif.id)
    const mem = await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: guest.id, roomId: room.id } } })
    expect(mem).toBeTruthy()
    expect(await testPrisma.notification.findUnique({ where: { id: notif.id } })).toBeNull()
    expect(io.emitted.find((e) => e.event === 'member_joined')).toBeTruthy()
  })
  it('scenario 33a: accept joins accepter\'s live sockets to the room channel', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    io.reset()
    await acceptInvitation(testPrisma, io, guest.id, notif.id)
    expect(io.subs).toContainEqual({
      in: `user:${guest.id}`, op: 'socketsJoin', target: `room:${room.id}`,
    })
  })
  it('accept: member_joined payload carries live online=true when accepter has an active socket', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    await onConnect(io, { userId: guest.id, id: 's1' }, testPrisma)
    io.reset()
    await acceptInvitation(testPrisma, io, guest.id, notif.id)
    const ev = io.emitted.find((e) => e.event === 'member_joined')
    expect(ev?.payload?.member?.online).toBe(true)
  })
  it('accept: member_joined payload carries online=false when accepter has no active socket', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    io.reset()
    await acceptInvitation(testPrisma, io, guest.id, notif.id)
    const ev = io.emitted.find((e) => e.event === 'member_joined')
    expect(ev?.payload?.member?.online).toBe(false)
  })
  it('scenario 34: decline → notification deleted, no membership change', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    await declineInvitation(testPrisma, guest.id, notif.id)
    expect(await testPrisma.notification.findUnique({ where: { id: notif.id } })).toBeNull()
    expect(await testPrisma.roomMember.findUnique({ where: { userId_roomId: { userId: guest.id, roomId: room.id } } })).toBeNull()
  })
  it('scenario 35: wrong-user accept → NOT_FOUND', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    const intruder = await testPrisma.user.create({ data: { email: 'i@x', username: 'intruder', passwordHash: 'x' } })
    await expect(acceptInvitation(testPrisma, io, intruder.id, notif.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 36: expired invitation → INVITE_EXPIRED', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const notif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    await testPrisma.notification.update({ where: { id: notif.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(acceptInvitation(testPrisma, io, guest.id, notif.id)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' })
  })
  it('scenario 38: non-member of private room tries to invite → NOT_FOUND (privacy)', async () => {
    const { io, room } = await seedPrivate()
    const stranger = await testPrisma.user.create({ data: { email: 's@x', username: 's', passwordHash: 'x' } })
    const target   = await testPrisma.user.create({ data: { email: 't@x', username: 't', passwordHash: 'x' } })
    await expect(inviteUser(testPrisma, io, stranger.id, room.id, { userId: target.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('scenario 39: member of public room invites → WRONG_VISIBILITY (400)', async () => {
    const io = createMockIo()
    const owner  = await testPrisma.user.create({ data: { email: 'o@x', username: 'owner', passwordHash: 'x' } })
    const target = await testPrisma.user.create({ data: { email: 't@x', username: 't', passwordHash: 'x' } })
    const room = await createRoom(testPrisma, io, owner.id, { name: 'pub', isPublic: true })
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: target.id })).rejects.toMatchObject({ code: 'WRONG_VISIBILITY' })
  })
  it('scenario 40: already a member → ALREADY_MEMBER', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    await testPrisma.roomMember.create({ data: { userId: guest.id, roomId: room.id, isAdmin: false } })
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })).rejects.toMatchObject({ code: 'ALREADY_MEMBER' })
  })
  it('scenario 41: already banned → ALREADY_BANNED', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    await testPrisma.roomBan.create({ data: { userId: guest.id, roomId: room.id, bannedById: owner.id } })
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })).rejects.toMatchObject({ code: 'ALREADY_BANNED' })
  })
  it('scenario 42: duplicate pending unexpired invite → PENDING_INVITE', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })).rejects.toMatchObject({ code: 'PENDING_INVITE' })
  })
  it('scenario 42a: expired invite present → new invite succeeds (fresh row)', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    const oldNotif = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    await testPrisma.notification.update({ where: { id: oldNotif.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const fresh = await inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })
    expect(fresh.id).not.toBe(oldNotif.id)
  })
  it('scenario 43: inviting self → CANNOT_INVITE_SELF', async () => {
    const { io, owner, room } = await seedPrivate()
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: owner.id })).rejects.toMatchObject({ code: 'CANNOT_INVITE_SELF' })
  })
  it('scenario 43a: target is soft-deleted user → NOT_FOUND', async () => {
    const { io, owner, guest, room } = await seedPrivate()
    await testPrisma.user.update({ where: { id: guest.id }, data: { deletedAt: new Date() } })
    await expect(inviteUser(testPrisma, io, owner.id, room.id, { userId: guest.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
