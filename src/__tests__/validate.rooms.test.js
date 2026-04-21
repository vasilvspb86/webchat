import { describe, it, expect } from 'vitest'
import { validateRoomName, validateRoomDescription } from '../utils/validate.js'

describe('validateRoomName', () => {
  it('accepts valid name within 3–50 chars', () => {
    expect(validateRoomName('general')).toBeNull()
    expect(validateRoomName('abc')).toBeNull()
    expect(validateRoomName('x'.repeat(50))).toBeNull()
  })
  it('rejects missing name', () => {
    expect(validateRoomName(undefined)).toMatch(/required/i)
    expect(validateRoomName('')).toMatch(/required/i)
    expect(validateRoomName(null)).toMatch(/required/i)
    expect(validateRoomName(123)).toMatch(/required/i)
  })
  it('trims before length check', () => {
    expect(validateRoomName('   a   ')).toMatch(/3.*50/)
    expect(validateRoomName('   abc   ')).toBeNull()
  })
  it('rejects < 3 chars after trim', () => {
    expect(validateRoomName('ab')).toMatch(/3.*50/)
  })
  it('rejects > 50 chars after trim', () => {
    expect(validateRoomName('x'.repeat(51))).toMatch(/3.*50/)
  })
})

describe('validateRoomDescription', () => {
  it('accepts null/undefined/empty (optional field)', () => {
    expect(validateRoomDescription(undefined)).toBeNull()
    expect(validateRoomDescription(null)).toBeNull()
    expect(validateRoomDescription('')).toBeNull()
  })
  it('accepts up to 500 chars', () => {
    expect(validateRoomDescription('x'.repeat(500))).toBeNull()
  })
  it('rejects > 500 chars', () => {
    expect(validateRoomDescription('x'.repeat(501))).toMatch(/500/)
  })
  it('rejects non-string', () => {
    expect(validateRoomDescription(123)).toMatch(/string/i)
  })
})
