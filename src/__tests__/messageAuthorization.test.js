import { describe, it, expect } from 'vitest'
import {
  canEditMessage,
  canDeleteMessage,
} from '../services/messageAuthorization.js'

describe('canEditMessage', () => {
  it('allows author on a non-deleted message', () => {
    expect(canEditMessage('U1', { authorId: 'U1', deleted: false })).toBe(true)
  })
  it('rejects non-author', () => {
    expect(canEditMessage('U2', { authorId: 'U1', deleted: false })).toBe(false)
  })
  it('rejects deleted message even for author', () => {
    expect(canEditMessage('U1', { authorId: 'U1', deleted: true })).toBe(false)
  })
})

describe('canDeleteMessage', () => {
  it('allows author', () => {
    expect(canDeleteMessage('member', 'U1', { authorId: 'U1', deleted: false })).toBe(true)
  })
  it('allows admin on any non-deleted message', () => {
    expect(canDeleteMessage('admin', 'U2', { authorId: 'U1', deleted: false })).toBe(true)
  })
  it('allows owner on any non-deleted message', () => {
    expect(canDeleteMessage('owner', 'U2', { authorId: 'U1', deleted: false })).toBe(true)
  })
  it('rejects non-author member on other user message', () => {
    expect(canDeleteMessage('member', 'U2', { authorId: 'U1', deleted: false })).toBe(false)
  })
  it('rejects everyone on already-deleted message', () => {
    expect(canDeleteMessage('admin', 'U2', { authorId: 'U1', deleted: true })).toBe(false)
  })
  it('rejects banned/none outright', () => {
    expect(canDeleteMessage('banned', 'U1', { authorId: 'U1', deleted: false })).toBe(false)
    expect(canDeleteMessage('none',   'U1', { authorId: 'U1', deleted: false })).toBe(false)
  })
})
