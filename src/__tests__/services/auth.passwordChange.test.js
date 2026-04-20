import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, changePassword } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('changePassword', () => {
  let userId
  beforeEach(async () => {
    await resetDb()
    const u = await register(testPrisma, creds)
    userId = u.id
    // seed current + other sessions
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 'current-sid', sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000) },
      { sid: 'other-sid',   sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('updates hash, keeps current session, kills others', async () => {
    await changePassword(testPrisma, { userId, currentPassword: 'pw1234', newPassword: 'brandnew1', currentSid: 'current-sid' })
    const row = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(await bcrypt.compare('brandnew1', row.passwordHash)).toBe(true)
    const rows = await testPrisma.user_sessions.findMany()
    expect(rows.map(r => r.sid)).toEqual(['current-sid'])
  })

  it('rejects wrong currentPassword', async () => {
    await expect(changePassword(testPrisma, { userId, currentPassword: 'WRONG', newPassword: 'brandnew1', currentSid: 'current-sid' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rejects weak new password', async () => {
    await expect(changePassword(testPrisma, { userId, currentPassword: 'pw1234', newPassword: 'abc', currentSid: 'current-sid' }))
      .rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })
})
