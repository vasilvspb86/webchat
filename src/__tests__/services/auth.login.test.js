import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, login } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('login', () => {
  beforeEach(async () => { await resetDb(); await register(testPrisma, creds) })

  it('returns the user on correct credentials', async () => {
    const u = await login(testPrisma, { email: 'a@b.c', password: 'pw1234' })
    expect(u).toMatchObject({ email: 'a@b.c', username: 'alice' })
  })

  it('lowercases email lookup', async () => {
    await expect(login(testPrisma, { email: 'A@B.C', password: 'pw1234' })).resolves.toBeTruthy()
  })

  it('throws INVALID_CREDENTIALS on wrong password', async () => {
    await expect(login(testPrisma, { email: 'a@b.c', password: 'WRONG' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('throws INVALID_CREDENTIALS on unknown email (no enumeration)', async () => {
    await expect(login(testPrisma, { email: 'nope@b.c', password: 'pw1234' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('throws INVALID_CREDENTIALS for soft-deleted user (looking up original email)', async () => {
    const u = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(),
      email: `deleted-${u.id}-a@b.c`,
      username: `deleted-${u.id}-alice`,
    }})
    await expect(login(testPrisma, { email: 'a@b.c', password: 'pw1234' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rejects missing fields with INVALID_INPUT', async () => {
    await expect(login(testPrisma, { email: '', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
