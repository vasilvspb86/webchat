import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createRoom } from '../../services/rooms.js'
import { onConnect, onDisconnect, _reset } from '../../socket/presence.js'
import { createMockIo } from '../helpers/io.js'
import bcrypt from 'bcryptjs'

async function seedUser(n) {
  return testPrisma.user.create({
    data: { email: `${n}@x.io`, username: n, passwordHash: await bcrypt.hash('pw', 10) },
  })
}

describe('presence (lean)', () => {
  beforeEach(async () => { await resetDb(); _reset() })

  it('first connect emits online to every room the user is in', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    const r1 = await createRoom(testPrisma, io, alice.id, { name: 'One', isPublic: true })
    const r2 = await createRoom(testPrisma, io, alice.id, { name: 'Two', isPublic: true })
    io.reset()
    await onConnect(io, { userId: alice.id, id: 's1' }, testPrisma)
    const ups = io.emitted.filter((e) => e.event === 'presence_update')
    expect(ups).toHaveLength(2)
    const rooms = ups.map((e) => e.room).sort()
    expect(rooms).toEqual([`room:${r1.id}`, `room:${r2.id}`].sort())
    expect(ups[0].payload).toEqual({ userId: alice.id, status: 'online' })
  })

  it('second connect from same user does not re-emit online', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    await createRoom(testPrisma, io, alice.id, { name: 'One', isPublic: true })
    await onConnect(io, { userId: alice.id, id: 's1' }, testPrisma)
    io.reset()
    await onConnect(io, { userId: alice.id, id: 's2' }, testPrisma)
    expect(io.emitted.filter((e) => e.event === 'presence_update')).toHaveLength(0)
  })

  it('only last disconnect emits offline', async () => {
    const io = createMockIo()
    const alice = await seedUser('alice')
    await createRoom(testPrisma, io, alice.id, { name: 'One', isPublic: true })
    await onConnect(io, { userId: alice.id, id: 's1' }, testPrisma)
    await onConnect(io, { userId: alice.id, id: 's2' }, testPrisma)
    io.reset()
    await onDisconnect(io, { userId: alice.id, id: 's1' }, testPrisma)
    expect(io.emitted.filter((e) => e.event === 'presence_update')).toHaveLength(0)
    await onDisconnect(io, { userId: alice.id, id: 's2' }, testPrisma)
    const ups = io.emitted.filter((e) => e.event === 'presence_update')
    expect(ups).toHaveLength(1)
    expect(ups[0].payload).toEqual({ userId: alice.id, status: 'offline' })
  })
})
