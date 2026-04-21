const MAX_MESSAGE_BYTES = 3072 // 3 KB
const MIN_PASSWORD_LENGTH = 6
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/

export function validateMessageContent(content) {
  if (!content || typeof content !== 'string') return 'Message content is required'
  if (Buffer.byteLength(content, 'utf8') > MAX_MESSAGE_BYTES) return 'Message exceeds 3 KB limit'
  return null
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required'
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  return null
}

export function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required'
  if (!USERNAME_PATTERN.test(username)) return 'Username must be 3–32 characters: letters, numbers, _ or -'
  return null
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required'
  if (!email.includes('@') || !email.includes('.')) return 'Invalid email address'
  return null
}

export function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) return 'Password confirmation is required'
  if (password !== confirmPassword) return 'Passwords do not match'
  return null
}

const ROOM_NAME_MIN = 3
const ROOM_NAME_MAX = 50
const ROOM_DESC_MAX = 500

export function validateRoomName(name) {
  if (!name || typeof name !== 'string') return 'Room name is required'
  const trimmed = name.trim()
  if (trimmed.length < ROOM_NAME_MIN || trimmed.length > ROOM_NAME_MAX) {
    return `Room name must be ${ROOM_NAME_MIN}–${ROOM_NAME_MAX} characters`
  }
  return null
}

export function validateRoomDescription(description) {
  if (description === undefined || description === null || description === '') return null
  if (typeof description !== 'string') return 'Room description must be a string'
  if (description.length > ROOM_DESC_MAX) return `Room description must be ${ROOM_DESC_MAX} characters or fewer`
  return null
}
