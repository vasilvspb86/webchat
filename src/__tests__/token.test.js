import { describe, it, expect } from 'vitest'
import { generateResetToken, hashToken } from '../utils/token.js'
import crypto from 'crypto'

describe('generateResetToken', () => {
  it('returns 64-char hex string', () => {
    const t = generateResetToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a different token each call', () => {
    expect(generateResetToken()).not.toBe(generateResetToken())
  })
})

describe('hashToken', () => {
  it('returns sha256 hex of input', () => {
    const raw = 'abc'
    const expected = crypto.createHash('sha256').update(raw).digest('hex')
    expect(hashToken(raw)).toBe(expected)
  })

  it('is deterministic', () => {
    expect(hashToken('x')).toBe(hashToken('x'))
  })
})
