import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { buildTestApp } from '../helpers/app.js'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'

async function signedInAgent({ email, username, password = 'password123' } = {}) {
  const io = createMockIo()
  const app = buildTestApp({ io })
  const agent = request.agent(app)
  await agent.post('/api/auth/register').send({
    email: email || `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@x.com`,
    username: username || `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    password, confirmPassword: password,
  }).expect(201)
  return { app, agent, io }
}

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

describe('POST /api/rooms', () => {
  it('201 + returns room with owner membership on success', async () => {
    const { agent } = await signedInAgent()
    const res = await agent.post('/api/rooms').send({ name: 'general', description: 'hello', isPublic: true }).expect(201)
    expect(res.body.room).toMatchObject({ name: 'general', isPublic: true })
  })
  it('400 on invalid name', async () => {
    const { agent } = await signedInAgent()
    await agent.post('/api/rooms').send({ name: 'ab' }).expect(400)
  })
  it('401 when unauthenticated', async () => {
    const { app } = await signedInAgent()
    await request(app).post('/api/rooms').send({ name: 'xxx' }).expect(401)
  })
  it('409 on case-insensitive name collision', async () => {
    const { agent } = await signedInAgent()
    await agent.post('/api/rooms').send({ name: 'General' }).expect(201)
    await agent.post('/api/rooms').send({ name: 'GENERAL' }).expect(409)
  })
})

describe('GET /api/rooms (catalog)', () => {
  it('returns paginated public rooms with nextCursor', async () => {
    const { agent } = await signedInAgent()
    for (let i = 0; i < 3; i++) await agent.post('/api/rooms').send({ name: `rm-${i}` }).expect(201)
    const res = await agent.get('/api/rooms').expect(200)
    expect(res.body.rooms).toHaveLength(3)
    expect(res.body).toHaveProperty('nextCursor')
  })
  it('private rooms are not in catalog', async () => {
    const { agent } = await signedInAgent()
    await agent.post('/api/rooms').send({ name: 'hidden', isPublic: false }).expect(201)
    const res = await agent.get('/api/rooms').expect(200)
    expect(res.body.rooms.map((r) => r.name)).not.toContain('hidden')
  })
})

describe('GET /api/rooms/:id', () => {
  it('200 member of private room', async () => {
    const { agent } = await signedInAgent()
    const c = await agent.post('/api/rooms').send({ name: 'priv', isPublic: false }).expect(201)
    await agent.get(`/api/rooms/${c.body.room.id}`).expect(200)
  })
  it('404 non-member of private room (privacy) — scenario 73', async () => {
    const { agent: owner } = await signedInAgent()
    const c = await owner.post('/api/rooms').send({ name: 'priv', isPublic: false }).expect(201)
    const { agent: outsider } = await signedInAgent()
    await outsider.get(`/api/rooms/${c.body.room.id}`).expect(404)
  })
  it('401 unauthenticated', async () => {
    const { app, agent } = await signedInAgent()
    const c = await agent.post('/api/rooms').send({ name: 'pub' }).expect(201)
    await request(app).get(`/api/rooms/${c.body.room.id}`).expect(401)
  })
})

describe('POST /api/rooms/:id/join — precedence ladder', () => {
  it('401 unauthenticated beats 404', async () => {
    const { app } = await signedInAgent()
    await request(app).post('/api/rooms/nope/join').expect(401)
  })
  it('banned + private = 404 (privacy beats 403) — scenario 26a', async () => {
    const { agent: owner } = await signedInAgent({ username: 'ownr' })
    const { agent: target } = await signedInAgent({ username: 'tgt1' })
    const c = await owner.post('/api/rooms').send({ name: 'priv', isPublic: false }).expect(201)
    const me = await target.get('/api/auth/me').expect(200)
    await testPrisma.roomBan.create({ data: { userId: me.body.user.id, roomId: c.body.room.id, bannedById: c.body.room.ownerId } })
    await target.post(`/api/rooms/${c.body.room.id}/join`).expect(404)
  })
  it('banned + public = 403 — scenario 26', async () => {
    const { agent: owner } = await signedInAgent({ username: 'ownr2' })
    const { agent: target } = await signedInAgent({ username: 'tgt2' })
    const c = await owner.post('/api/rooms').send({ name: 'pub', isPublic: true }).expect(201)
    const me = await target.get('/api/auth/me').expect(200)
    await testPrisma.roomBan.create({ data: { userId: me.body.user.id, roomId: c.body.room.id, bannedById: c.body.room.ownerId } })
    await target.post(`/api/rooms/${c.body.room.id}/join`).expect(403)
  })
})

describe('POST /api/rooms/:id/leave', () => {
  it('409 owner cannot leave', async () => {
    const { agent } = await signedInAgent()
    const c = await agent.post('/api/rooms').send({ name: 'room' }).expect(201)
    await agent.post(`/api/rooms/${c.body.room.id}/leave`).expect(409)
  })
})

describe('Socket emit timing — scenario 75', () => {
  it('no broadcast when transaction fails', async () => {
    const { agent, io } = await signedInAgent()
    io.reset()
    await agent.delete('/api/rooms/00000000-0000-0000-0000-000000000000').expect(404)
    expect(io.emitted).toEqual([])
  })
  it('room_deleted emitted on successful delete', async () => {
    const { agent, io } = await signedInAgent()
    const c = await agent.post('/api/rooms').send({ name: 'to-delete' }).expect(201)
    io.reset()
    await agent.delete(`/api/rooms/${c.body.room.id}`).expect(204)
    expect(io.emitted.find((e) => e.event === 'room_deleted')).toBeTruthy()
  })
})

describe('DELETE /api/rooms/:id — cascades', () => {
  it('deletes and returns 404 on subsequent GET', async () => {
    const { agent } = await signedInAgent()
    const c = await agent.post('/api/rooms').send({ name: 'gone' }).expect(201)
    await agent.delete(`/api/rooms/${c.body.room.id}`).expect(204)
    await agent.get(`/api/rooms/${c.body.room.id}`).expect(404)
  })
})

describe('PATCH /api/rooms/:id — owner only', () => {
  it('403 when non-owner admin attempts edit', async () => {
    const { agent: owner } = await signedInAgent({ username: 'owner1' })
    const { agent: other } = await signedInAgent({ username: 'other1' })
    const c = await owner.post('/api/rooms').send({ name: 'r-owned' }).expect(201)
    const me = await other.get('/api/auth/me').expect(200)
    await testPrisma.roomMember.create({ data: { userId: me.body.user.id, roomId: c.body.room.id, isAdmin: true } })
    await other.patch(`/api/rooms/${c.body.room.id}`).send({ name: 'hijack' }).expect(403)
  })
})
