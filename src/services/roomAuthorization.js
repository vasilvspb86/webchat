export function resolveRole(userId, room, memberRow, banRow) {
  if (memberRow) {
    if (userId === room.ownerId) return 'owner'
    return memberRow.isAdmin ? 'admin' : 'member'
  }
  if (banRow) return 'banned'
  return 'none'
}

const MEMBER_ROLES = new Set(['owner', 'admin', 'member'])

export function canReadRoom(role, room) {
  if (MEMBER_ROLES.has(role)) return true
  if (role === 'banned') return false
  return Boolean(room.isPublic)
}

export function canEditRoom(role)   { return role === 'owner' }
export function canDeleteRoom(role) { return role === 'owner' }

export function canInviteToRoom(role, room) {
  if (room.isPublic) return false
  return MEMBER_ROLES.has(role)
}

export function canRemoveMember(actorRole, targetRole, actorUserId, targetUserId) {
  if (actorRole !== 'admin' && actorRole !== 'owner') return false
  if (targetRole === 'owner') return false
  if (actorUserId === targetUserId) return false
  return true
}

export const canBan = canRemoveMember

export function canRevokeAdmin(actorRole, targetRole, actorUserId, targetUserId) {
  if (targetRole === 'owner') return false
  if (actorRole !== 'admin' && actorRole !== 'owner') return false
  // Self-revoke allowed for non-owner admins (step down)
  if (actorUserId === targetUserId) return actorRole === 'admin'
  // Admins are peers — any admin/owner can revoke another's admin
  return true
}

export function canUnban(role)      { return role === 'admin' || role === 'owner' }
export function canViewBans(role)   { return role === 'admin' || role === 'owner' }
export function canGrantAdmin(role) { return role === 'admin' || role === 'owner' }
