import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, listSessions, revokeSession } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('listSessions / revokeSession', () => {
  let userId, otherId
  beforeEach(async () => {
    await resetDb()
    userId  = (await register(testPrisma, creds)).id
    otherId = (await register(testPrisma, { ...creds, email: 'b@b.c', username: 'bob' })).id
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 's1', sess: { userId, userAgent: 'UA1', ip: '1.1.1.1', createdAt: '2026-01-01' }, expire: new Date(Date.now() + 60000) },
      { sid: 's2', sess: { userId, userAgent: 'UA2', ip: '2.2.2.2', createdAt: '2026-01-02' }, expire: new Date(Date.now() + 60000) },
      { sid: 'x1', sess: { userId: otherId, cookie: {} }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('lists only caller sessions, with isCurrent flag', async () => {
    const sessions = await listSessions(testPrisma, { userId, currentSid: 's1' })
    expect(sessions).toHaveLength(2)
    expect(sessions.find(s => s.sid === 's1').isCurrent).toBe(true)
    expect(sessions.find(s => s.sid === 's2').isCurrent).toBe(false)
    expect(sessions.every(s => s.sid !== 'x1')).toBe(true)
  })

  it('revokes own session', async () => {
    await revokeSession(testPrisma, { userId, sid: 's2' })
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 's2' } })).toBeNull()
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 's1' } })).toBeTruthy()
  })

  it('throws NOT_FOUND for another user session', async () => {
    await expect(revokeSession(testPrisma, { userId, sid: 'x1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 'x1' } })).toBeTruthy()
  })

  it('throws NOT_FOUND for missing sid', async () => {
    await expect(revokeSession(testPrisma, { userId, sid: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
