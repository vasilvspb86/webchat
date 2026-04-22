import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildTestApp } from '../helpers/app.js'
import { testPrisma, resetDb } from '../helpers/db.js'

const app = buildTestApp()

async function register(agent, creds) {
  await agent.post('/api/auth/register').send(creds).expect(201)
}

describe('GET /api/messages/:roomId', () => {
  beforeEach(async () => { await resetDb() })

  it('401 when not authenticated', async () => {
    await request(app).get('/api/messages/R').expect(401)
  })

  it('403 when not a member', async () => {
    const alice = request.agent(app)
    const bob   = request.agent(app)
    await register(alice, { email: 'a@x.io', username: 'alice', password: 'secret', confirmPassword: 'secret' })
    await register(bob,   { email: 'b@x.io', username: 'bob',   password: 'secret', confirmPassword: 'secret' })
    const { body } = await alice.post('/api/rooms').send({ name: 'Hall', isPublic: true }).expect(201)
    await bob.get(`/api/messages/${body.room.id}`).expect(403)
  })

  it('returns {messages, nextCursor} for a member, cursor paginates', async () => {
    const alice = request.agent(app)
    await register(alice, { email: 'a@x.io', username: 'alice', password: 'secret', confirmPassword: 'secret' })
    const { body: cr } = await alice.post('/api/rooms').send({ name: 'Hall', isPublic: true }).expect(201)
    const me = await testPrisma.user.findUnique({ where: { email: 'a@x.io' } })
    for (let i = 0; i < 60; i++) {
      await testPrisma.message.create({ data: { roomId: cr.room.id, authorId: me.id, content: `m${i}` } })
    }
    const page1 = (await alice.get(`/api/messages/${cr.room.id}`).expect(200)).body
    expect(page1.messages).toHaveLength(50)
    expect(page1.nextCursor).toBeTruthy()
    const page2 = (await alice.get(`/api/messages/${cr.room.id}?before=${page1.nextCursor}`).expect(200)).body
    expect(page2.messages).toHaveLength(10)
    expect(page2.nextCursor).toBe(null)
  })

  it('404 when room does not exist', async () => {
    const alice = request.agent(app)
    await register(alice, { email: 'a@x.io', username: 'alice', password: 'secret', confirmPassword: 'secret' })
    await alice.get('/api/messages/00000000-0000-0000-0000-000000000000').expect(404)
  })
})
