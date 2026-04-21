import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'
import { createRoom, listPublicRooms } from '../../services/rooms.js'

async function mkUser(suffix) { return testPrisma.user.create({ data: { email: `u${suffix}@x`, username: `u${suffix}`, passwordHash: 'x' } }) }

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('listPublicRooms (group B)', () => {
  it('scenario 17: empty result returns { rooms: [], nextCursor: null }', async () => {
    const { rooms, nextCursor } = await listPublicRooms(testPrisma, { q: '', cursor: null })
    expect(rooms).toEqual([])
    expect(nextCursor).toBeNull()
  })
  it('scenarios 11, 15: 20/page newest first with memberCount including owner', async () => {
    const io = createMockIo()
    const owner = await mkUser(0)
    for (let i = 0; i < 25; i++) await createRoom(testPrisma, io, owner.id, { name: `rm-${i}`, isPublic: true })
    const page1 = await listPublicRooms(testPrisma, { q: '', cursor: null })
    expect(page1.rooms).toHaveLength(20)
    expect(page1.nextCursor).toBeTruthy()
    for (const r of page1.rooms) expect(r.memberCount).toBeGreaterThanOrEqual(1)
  })
  it('scenario 16: cursor pagination returns older rooms', async () => {
    const io = createMockIo()
    const owner = await mkUser(1)
    for (let i = 0; i < 25; i++) await createRoom(testPrisma, io, owner.id, { name: `rm-${i}`, isPublic: true })
    const page1 = await listPublicRooms(testPrisma, { q: '', cursor: null })
    const page2 = await listPublicRooms(testPrisma, { q: '', cursor: page1.nextCursor })
    expect(page2.rooms.length).toBeGreaterThan(0)
    expect(page2.rooms.length).toBeLessThanOrEqual(20)
    const lastOnPage1 = page1.rooms[page1.rooms.length - 1]
    const firstOnPage2 = page2.rooms[0]
    expect(new Date(firstOnPage2.createdAt).getTime()).toBeLessThan(new Date(lastOnPage1.createdAt).getTime())
  })
  it('scenario 12: q matches name OR description, case-insensitive', async () => {
    const io = createMockIo()
    const owner = await mkUser(2)
    await createRoom(testPrisma, io, owner.id, { name: 'coffee',  description: 'daily chat', isPublic: true })
    await createRoom(testPrisma, io, owner.id, { name: 'tea',     description: 'loves COFFEE', isPublic: true })
    await createRoom(testPrisma, io, owner.id, { name: 'unrelated', description: null, isPublic: true })
    const { rooms } = await listPublicRooms(testPrisma, { q: 'coffee', cursor: null })
    expect(rooms.map((r) => r.name).sort()).toEqual(['coffee', 'tea'])
  })
  it('scenario 13: private rooms never appear regardless of caller', async () => {
    const io = createMockIo()
    const owner = await mkUser(3)
    await createRoom(testPrisma, io, owner.id, { name: 'private-r', isPublic: false })
    await createRoom(testPrisma, io, owner.id, { name: 'public-r',  isPublic: true })
    const { rooms } = await listPublicRooms(testPrisma, { q: '', cursor: null })
    expect(rooms.map((r) => r.name)).toEqual(['public-r'])
  })
  it('scenario 14: banned user still sees public room in catalog', async () => {
    const io = createMockIo()
    const owner  = await mkUser(4)
    const banned = await mkUser(5)
    const room = await createRoom(testPrisma, io, owner.id, { name: 'open', isPublic: true })
    await testPrisma.roomBan.create({ data: { userId: banned.id, roomId: room.id, bannedById: owner.id } })
    const { rooms } = await listPublicRooms(testPrisma, { q: '', cursor: null })
    expect(rooms.some((r) => r.id === room.id)).toBe(true)
  })
})
