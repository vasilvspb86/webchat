import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register } from '../../services/auth.js'

const valid = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('register', () => {
  beforeEach(async () => { await resetDb() })

  it('creates a user and returns id/email/username', async () => {
    const user = await register(testPrisma, valid)
    expect(user).toMatchObject({ email: 'a@b.c', username: 'alice' })
    expect(user.id).toBeDefined()
  })

  it('stores a bcrypt hash (cost >= 10), never plaintext', async () => {
    await register(testPrisma, valid)
    const row = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    expect(row.passwordHash).toMatch(/^\$2[aby]\$1\d\$/)
    expect(await bcrypt.compare('pw1234', row.passwordHash)).toBe(true)
  })

  it('lowercases the email', async () => {
    await register(testPrisma, { ...valid, email: 'A@B.C' })
    const row = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    expect(row).toBeTruthy()
  })

  it('rejects duplicate active email with EMAIL_TAKEN', async () => {
    await register(testPrisma, valid)
    await expect(register(testPrisma, { ...valid, username: 'other' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('rejects duplicate active username with USERNAME_TAKEN', async () => {
    await register(testPrisma, valid)
    await expect(register(testPrisma, { ...valid, email: 'x@y.z' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN' })
  })

  it('rejects invalid email', async () => {
    await expect(register(testPrisma, { ...valid, email: 'bad' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  })

  it('rejects invalid username', async () => {
    await expect(register(testPrisma, { ...valid, username: 'a b' })).rejects.toMatchObject({ code: 'INVALID_USERNAME' })
  })

  it('rejects short password', async () => {
    await expect(register(testPrisma, { ...valid, password: 'abc', confirmPassword: 'abc' })).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })

  it('rejects mismatched confirmPassword', async () => {
    await expect(register(testPrisma, { ...valid, confirmPassword: 'different' })).rejects.toMatchObject({ code: 'PASSWORD_MISMATCH' })
  })

  it('allows re-registering an email freed by a soft-deleted user', async () => {
    const u = await register(testPrisma, valid)
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(),
      email: `deleted-${u.id}-a@b.c`,
      username: `deleted-${u.id}-alice`,
    }})
    await expect(register(testPrisma, valid)).resolves.toMatchObject({ email: 'a@b.c' })
  })
})
