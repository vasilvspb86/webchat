import { describe, it, expect } from 'vitest'
import { validateMessageContent, validatePassword, validateUsername, validateEmail, validateConfirmPassword } from '../utils/validate.js'

describe('validateMessageContent', () => {
  it('returns null for valid content', () => {
    expect(validateMessageContent('Hello world')).toBeNull()
  })

  it('rejects empty content', () => {
    expect(validateMessageContent('')).not.toBeNull()
    expect(validateMessageContent(null)).not.toBeNull()
  })

  it('rejects content over 3 KB', () => {
    const over3KB = 'a'.repeat(3073)
    expect(validateMessageContent(over3KB)).toMatch(/3 KB/)
  })

  it('accepts content exactly at the 3 KB boundary', () => {
    const exactly3KB = 'a'.repeat(3072)
    expect(validateMessageContent(exactly3KB)).toBeNull()
  })

  it('measures size in bytes not characters (UTF-8 multibyte)', () => {
    // Each emoji is 4 bytes — 769 emojis = 3076 bytes > 3072
    const manyEmojis = '😀'.repeat(769)
    expect(validateMessageContent(manyEmojis)).not.toBeNull()
  })
})

describe('validatePassword', () => {
  it('returns null for a valid password', () => {
    expect(validatePassword('correct-horse-battery')).toBeNull()
  })

  it('rejects passwords shorter than 6 characters', () => {
    expect(validatePassword('abc')).not.toBeNull()
  })

  it('rejects empty password', () => {
    expect(validatePassword('')).not.toBeNull()
    expect(validatePassword(null)).not.toBeNull()
  })
})

describe('validateUsername', () => {
  it('returns null for a valid username', () => {
    expect(validateUsername('alice_99')).toBeNull()
  })

  it('rejects usernames shorter than 3 characters', () => {
    expect(validateUsername('ab')).not.toBeNull()
  })

  it('rejects usernames with spaces', () => {
    expect(validateUsername('alice bob')).not.toBeNull()
  })

  it('rejects usernames with special characters', () => {
    expect(validateUsername('alice@chat')).not.toBeNull()
  })
})

describe('validateEmail', () => {
  it('returns null for a valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull()
  })

  it('rejects email without @', () => {
    expect(validateEmail('notanemail')).not.toBeNull()
  })

  it('rejects empty email', () => {
    expect(validateEmail('')).not.toBeNull()
  })
})

describe('validateConfirmPassword', () => {
  it('returns null when passwords match', () => {
    expect(validateConfirmPassword('abcdef', 'abcdef')).toBeNull()
  })
  it('rejects when passwords differ', () => {
    expect(validateConfirmPassword('abcdef', 'abcdeg')).not.toBeNull()
  })
  it('rejects missing confirmPassword', () => {
    expect(validateConfirmPassword('abcdef', '')).not.toBeNull()
  })
})
