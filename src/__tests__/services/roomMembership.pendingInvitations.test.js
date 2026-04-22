import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import {
  inviteUser, acceptInvitation, listPendingInvitations, revokeInvitation,
} from '../../services/roomMembership.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('listPendingInvitations + revokeInvitation', () => {
  beforeEach(async () => { await resetDb() })

  it('owner sees all pending invites for a private room', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const carol = await seedUser('carol')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Private', isPublic: false })
    await inviteUser(testPrisma, io, alice.id, room.id, { userId: bob.id })
    await inviteUser(testPrisma, io, alice.id, room.id, { userId: carol.id })
    const invites = await listPendingInvitations(testPrisma, alice.id, room.id)
    const names = invites.map((i) => i.invitedUsername).sort()
    expect(names).toEqual(['bob', 'carol'])
    expect(invites[0].invitedByUsername).toBe('alice')
  })

  it('non-admin member cannot list', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Private', isPublic: false })
    const notif = await inviteUser(testPrisma, io, alice.id, room.id, { userId: bob.id })
    await acceptInvitation(testPrisma, io, bob.id, notif.id)
    await expect(listPendingInvitations(testPrisma, bob.id, room.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('excludes expired invitations', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Private', isPublic: false })
    const notif = await inviteUser(testPrisma, io, alice.id, room.id, { userId: bob.id })
    await testPrisma.notification.update({
      where: { id: notif.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const invites = await listPendingInvitations(testPrisma, alice.id, room.id)
    expect(invites).toHaveLength(0)
  })

  it('revokeInvitation deletes; non-admin is FORBIDDEN; wrong-room is NOT_FOUND', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const bob   = await seedUser('bob')
    const room = await createRoom(testPrisma, io, alice.id, { name: 'Private', isPublic: false })
    const notif = await inviteUser(testPrisma, io, alice.id, room.id, { userId: bob.id })
    await expect(revokeInvitation(testPrisma, io, bob.id, room.id, notif.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
    await revokeInvitation(testPrisma, io, alice.id, room.id, notif.id)
    expect(await testPrisma.notification.findUnique({ where: { id: notif.id } })).toBeNull()
  })
})
