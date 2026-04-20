import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, requestPasswordReset, resetPassword } from '../../services/auth.js'
import { hashToken } from '../../utils/token.js'
import { setTransport } from '../../utils/mailer.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('requestPasswordReset', () => {
  let captured
  beforeEach(async () => {
    await resetDb()
    captured = []
    setTransport({ sendMail: async (opts) => { captured.push(opts); return { messageId: 'x' } } })
  })

  it('creates a token and sends email for a known address', async () => {
    const u = await register(testPrisma, creds)
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: u.id } })
    expect(tokens).toHaveLength(1)
    const t = tokens[0]
    expect(t.usedAt).toBeNull()
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000)
    expect(t.expiresAt.getTime()).toBeLessThan(Date.now() + 70 * 60 * 1000)
    expect(captured).toHaveLength(1)
    expect(captured[0].to).toBe('a@b.c')
    expect(captured[0].text + (captured[0].html || '')).toMatch(/token=[0-9a-f]{64}/)
  })

  it('returns silently (no email, no token) for unknown email', async () => {
    await requestPasswordReset(testPrisma, { email: 'nobody@x.y' })
    expect(await testPrisma.passwordResetToken.count()).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('returns silently for soft-deleted users', async () => {
    const u = await register(testPrisma, creds)
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(), email: `deleted-${u.id}-a@b.c`, username: `deleted-${u.id}-alice`,
    }})
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    expect(await testPrisma.passwordResetToken.count()).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('stores sha256 tokenHash — never raw', async () => {
    const u = await register(testPrisma, creds)
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    const raw = captured[0].text.match(/token=([0-9a-f]{64})/)[1]
    const t = await testPrisma.passwordResetToken.findFirst({ where: { userId: u.id } })
    expect(t.tokenHash).toBe(hashToken(raw))
    expect(t.tokenHash).not.toBe(raw)
  })

  it('rejects malformed email', async () => {
    await expect(requestPasswordReset(testPrisma, { email: 'bad' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  })
})

describe('resetPassword', () => {
  let userId, rawToken
  beforeEach(async () => {
    await resetDb()
    const captured = []
    setTransport({ sendMail: async (opts) => { captured.push(opts); return { messageId: 'x' } } })
    const u = await register(testPrisma, creds)
    userId = u.id
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    rawToken = captured[0].text.match(/token=([0-9a-f]{64})/)[1]
  })

  it('resets password, marks token used, deletes all sessions for the user', async () => {
    // seed a session row for this user
    await testPrisma.user_sessions.create({ data: {
      sid: 'fake-sid', sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000),
    }})
    await resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' })
    const row = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(await bcrypt.compare('newpass1', row.passwordHash)).toBe(true)
    expect(await bcrypt.compare('pw1234', row.passwordHash)).toBe(false)
    const t = await testPrisma.passwordResetToken.findFirst({ where: { userId } })
    expect(t.usedAt).toBeTruthy()
    expect(await testPrisma.user_sessions.count()).toBe(0)
  })

  it('rejects reused token', async () => {
    await resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' })
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass2' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects expired token', async () => {
    await testPrisma.passwordResetToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects unknown token', async () => {
    await expect(resetPassword(testPrisma, { token: 'f'.repeat(64), newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects if user was soft-deleted after token issuance', async () => {
    await testPrisma.user.update({ where: { id: userId }, data: {
      deletedAt: new Date(), email: `deleted-${userId}-a@b.c`, username: `deleted-${userId}-alice`,
    }})
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects weak new password', async () => {
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'abc' }))
      .rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })
})
