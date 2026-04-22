import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildTestApp } from '../helpers/app.js'
import { resetDb } from '../helpers/db.js'

const app = buildTestApp()

async function register(agent, creds) {
  await agent.post('/api/auth/register').send(creds).expect(201)
}

describe('GET /api/rooms/mine', () => {
  beforeEach(async () => { await resetDb() })

  it('401 when not authenticated', async () => {
    await request(app).get('/api/rooms/mine').expect(401)
  })

  it('returns {rooms} the caller is a member of', async () => {
    const alice = request.agent(app)
    const bob   = request.agent(app)
    await register(alice, { email: 'a@x.io', username: 'alice', password: 'secret', confirmPassword: 'secret' })
    await register(bob,   { email: 'b@x.io', username: 'bob',   password: 'secret', confirmPassword: 'secret' })
    await alice.post('/api/rooms').send({ name: 'Alpha', isPublic: true }).expect(201)
    await bob.post('/api/rooms').send({ name: 'Beta', isPublic: true }).expect(201)
    const list = (await bob.get('/api/rooms/mine').expect(200)).body
    expect(list.rooms.map(r => r.name)).toEqual(['Beta'])
    expect(list.rooms[0].isOwner).toBe(true)
  })
})
