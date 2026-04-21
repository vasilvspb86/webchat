import { describe, it, expect } from 'vitest'
import {
  resolveRole,
  canReadRoom,
  canEditRoom,
  canDeleteRoom,
  canInviteToRoom,
  canRemoveMember,
  canUnban,
  canViewBans,
  canGrantAdmin,
  canRevokeAdmin,
} from '../services/roomAuthorization.js'

const publicRoom  = { id: 'r1', ownerId: 'owner', isPublic: true }
const privateRoom = { id: 'r1', ownerId: 'owner', isPublic: false }
const adminMember = { userId: 'admin',  roomId: 'r1', isAdmin: true }
const plainMember = { userId: 'member', roomId: 'r1', isAdmin: false }
const banRow      = { userId: 'banned', roomId: 'r1' }

describe('resolveRole (scenario 67)', () => {
  it('owner when userId === room.ownerId and member row present', () => {
    expect(resolveRole('owner', publicRoom, { userId: 'owner', isAdmin: true }, null)).toBe('owner')
  })
  it('admin when member row has isAdmin=true and user is not owner', () => {
    expect(resolveRole('admin', publicRoom, adminMember, null)).toBe('admin')
  })
  it('member when member row present and isAdmin=false', () => {
    expect(resolveRole('member', publicRoom, plainMember, null)).toBe('member')
  })
  it('banned when ban row present and no member row', () => {
    expect(resolveRole('banned', publicRoom, null, banRow)).toBe('banned')
  })
  it('none when neither member nor ban row', () => {
    expect(resolveRole('stranger', publicRoom, null, null)).toBe('none')
  })
})

describe('canReadRoom (scenario 71a)', () => {
  it('member/admin/owner on any room: true', () => {
    expect(canReadRoom('owner',  publicRoom)).toBe(true)
    expect(canReadRoom('admin',  privateRoom)).toBe(true)
    expect(canReadRoom('member', privateRoom)).toBe(true)
  })
  it("'none' on public room: true", () => {
    expect(canReadRoom('none', publicRoom)).toBe(true)
  })
  it("'none' on private room: false", () => {
    expect(canReadRoom('none', privateRoom)).toBe(false)
  })
  it("'banned' on either: false", () => {
    expect(canReadRoom('banned', publicRoom)).toBe(false)
    expect(canReadRoom('banned', privateRoom)).toBe(false)
  })
})

describe('canEditRoom / canDeleteRoom (scenario 70)', () => {
  it('true only for owner', () => {
    for (const r of ['owner', 'admin', 'member', 'banned', 'none']) {
      expect(canEditRoom(r)).toBe(r === 'owner')
      expect(canDeleteRoom(r)).toBe(r === 'owner')
    }
  })
})

describe('canInviteToRoom (scenario 71)', () => {
  it('true for any member role on private rooms', () => {
    expect(canInviteToRoom('owner',  privateRoom)).toBe(true)
    expect(canInviteToRoom('admin',  privateRoom)).toBe(true)
    expect(canInviteToRoom('member', privateRoom)).toBe(true)
  })
  it('false for public rooms regardless of role', () => {
    expect(canInviteToRoom('owner',  publicRoom)).toBe(false)
    expect(canInviteToRoom('admin',  publicRoom)).toBe(false)
    expect(canInviteToRoom('member', publicRoom)).toBe(false)
  })
  it('false for none/banned', () => {
    expect(canInviteToRoom('none',   privateRoom)).toBe(false)
    expect(canInviteToRoom('banned', privateRoom)).toBe(false)
  })
})

describe('canRemoveMember (scenario 68)', () => {
  it('admin -> member: true', () => {
    expect(canRemoveMember('admin', 'member', 'a', 'b')).toBe(true)
  })
  it('admin -> admin: true (peers)', () => {
    expect(canRemoveMember('admin', 'admin', 'a', 'b')).toBe(true)
  })
  it('admin -> owner: false', () => {
    expect(canRemoveMember('admin', 'owner', 'a', 'b')).toBe(false)
  })
  it('admin -> self: false (use /leave)', () => {
    expect(canRemoveMember('admin', 'admin', 'a', 'a')).toBe(false)
  })
  it('member -> anything: false', () => {
    expect(canRemoveMember('member', 'member', 'a', 'b')).toBe(false)
  })
})

describe('canRevokeAdmin (scenarios 69, 58a, 58c)', () => {
  it('admin -> admin (different people): true', () => {
    expect(canRevokeAdmin('admin', 'admin', 'a', 'b')).toBe(true)
  })
  it('anyone -> owner: false (owner never demotable)', () => {
    expect(canRevokeAdmin('owner',  'owner', 'o', 'o')).toBe(false)
    expect(canRevokeAdmin('admin',  'owner', 'a', 'o')).toBe(false)
  })
  it('non-owner admin revoking their own admin: true (step down)', () => {
    expect(canRevokeAdmin('admin', 'admin', 'a', 'a')).toBe(true)
  })
  it('plain member revoking anyone: false', () => {
    expect(canRevokeAdmin('member', 'admin', 'm', 'a')).toBe(false)
  })
})

describe('canUnban / canViewBans / canGrantAdmin (scenario 71b)', () => {
  it('true only for admin or owner', () => {
    for (const r of ['owner', 'admin', 'member', 'banned', 'none']) {
      const expected = r === 'admin' || r === 'owner'
      expect(canUnban(r)).toBe(expected)
      expect(canViewBans(r)).toBe(expected)
      expect(canGrantAdmin(r)).toBe(expected)
    }
  })
})
