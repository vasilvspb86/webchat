const ALLOWED_DELETE_ROLES = new Set(['member', 'admin', 'owner'])

export function canEditMessage(actorUserId, message) {
  if (!message || message.deleted) return false
  return message.authorId === actorUserId
}

export function canDeleteMessage(actorRole, actorUserId, message) {
  if (!message || message.deleted) return false
  if (!ALLOWED_DELETE_ROLES.has(actorRole)) return false
  if (message.authorId === actorUserId) return true
  return actorRole === 'admin' || actorRole === 'owner'
}
