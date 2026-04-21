import crypto from 'crypto'

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}
