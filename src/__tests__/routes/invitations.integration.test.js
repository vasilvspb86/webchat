import { describe, it, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { buildTestApp } from '../helpers/app.js'
import { testPrisma, resetDb } from '../helpers/db.js'
import { createMockIo } from '../helpers/io.js'

beforeEach(() => resetDb())
afterAll(() => testPrisma.$disconnect())

async function signIn({ username, password = 'password123' } = {}) {
  const io = createMockIo()
  const app = buildTestApp({ io })
  const agent = request.agent(app)
  const email = `${username || 'u' + Date.now()}@x.com`
  await agent.post('/api/auth/register').send({
    email, username: username || `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    password, confirmPassword: password,
  }).expect(201)
  return { app, agent, io }
}

async function createPrivateRoomWithInvite() {
  const owner  = await signIn({ username: `owner${Math.random().toString(36).slice(2, 6)}` })
  const guest  = await signIn({ username: `guest${Math.random().toString(36).slice(2, 6)}` })
  const created = await owner.agent.post('/api/rooms').send({ name: `priv-${Date.now()}`, isPublic: false }).expect(201)
  const me = await guest.agent.get('/api/auth/me').expect(200)
  const invite = await owner.agent.post(`/api/rooms/${created.body.room.id}/invitations`).send({ userId: me.body.user.id }).expect(201)
  return { owner, guest, roomId: created.body.room.id, notificationId: invite.body.invitation.id }
}

describe('POST /api/invitations/:id/accept', () => {
  it('scenario 33: invitee accepts → 204, membership created', async () => {
    const { guest, roomId, notificationId } = await createPrivateRoomWithInvite()
    await guest.agent.post(`/api/invitations/${notificationId}/accept`).expect(204)
    await guest.agent.get(`/api/rooms/${roomId}`).expect(200)
  })
  it('scenario 35: wrong user → 404', async () => {
    const { notificationId } = await createPrivateRoomWithInvite()
    const intruder = await signIn({ username: 'intruder' })
    await intruder.agent.post(`/api/invitations/${notificationId}/accept`).expect(404)
  })
  it('scenario 36: expired → 410', async () => {
    const { guest, notificationId } = await createPrivateRoomWithInvite()
    await testPrisma.notification.update({ where: { id: notificationId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await guest.agent.post(`/api/invitations/${notificationId}/accept`).expect(410)
  })
  it('scenario 37: already acted on → 404 (second call, notif deleted)', async () => {
    const { guest, notificationId } = await createPrivateRoomWithInvite()
    await guest.agent.post(`/api/invitations/${notificationId}/accept`).expect(204)
    await guest.agent.post(`/api/invitations/${notificationId}/accept`).expect(404)
  })
})

describe('POST /api/invitations/:id/decline', () => {
  it('scenario 34: 204 + notification deleted + no membership', async () => {
    const { guest, roomId, notificationId } = await createPrivateRoomWithInvite()
    await guest.agent.post(`/api/invitations/${notificationId}/decline`).expect(204)
    await guest.agent.get(`/api/rooms/${roomId}`).expect(404)
  })
})
