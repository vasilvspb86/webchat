import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildTestApp } from '../helpers/app.js'
import { resetDb, testPrisma } from '../helpers/db.js'

const app = buildTestApp()

async function register(agent, creds) {
  await agent.post('/api/auth/register').send(creds).expect(201)
}

describe('admin pending-invitations routes', () => {
  beforeEach(async () => { await resetDb() })

  it('owner GETs invitations, DELETE revokes; non-member of private room sees 404', async () => {
    const alice = request.agent(app)
    const bob   = request.agent(app)
    const carol = request.agent(app)
    await register(alice, { email: 'a@x.io', username: 'alice', password: 'secret', confirmPassword: 'secret' })
    await register(bob,   { email: 'b@x.io', username: 'bob',   password: 'secret', confirmPassword: 'secret' })
    await register(carol, { email: 'c@x.io', username: 'carol', password: 'secret', confirmPassword: 'secret' })

    const { body: room } = await alice.post('/api/rooms').send({ name: 'Private', isPublic: false }).expect(201)
    const bobUser   = await testPrisma.user.findUnique({ where: { email: 'b@x.io' } })
    const carolUser = await testPrisma.user.findUnique({ where: { email: 'c@x.io' } })
    await alice.post(`/api/rooms/${room.room.id}/invitations`).send({ userId: bobUser.id }).expect(201)
    await alice.post(`/api/rooms/${room.room.id}/invitations`).send({ userId: carolUser.id }).expect(201)

    const list = (await alice.get(`/api/rooms/${room.room.id}/invitations`).expect(200)).body
    expect(list.invitations).toHaveLength(2)

    const notifId = list.invitations[0].notificationId
    await alice.delete(`/api/rooms/${room.room.id}/invitations/${notifId}`).expect(204)
    const list2 = (await alice.get(`/api/rooms/${room.room.id}/invitations`).expect(200)).body
    expect(list2.invitations).toHaveLength(1)

    // carol was invited but never accepted — still a non-member. Private room → 404 via the
    // privacy precedence check inside the route handler (hides existence from non-members),
    // NOT the service's FORBIDDEN/403 which would leak existence.
    await carol.get(`/api/rooms/${room.room.id}/invitations`).expect(404)
  })
})
