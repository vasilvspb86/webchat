import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from './helpers/db.js'

describe('test DB harness', () => {
  beforeEach(async () => { await resetDb() })

  it('connects and starts empty', async () => {
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  it('resetDb wipes users between tests', async () => {
    await testPrisma.user.create({ data: { email: 'a@b.c', username: 'aaa', passwordHash: 'x' } })
    expect(await testPrisma.user.count()).toBe(1)
  })
})
