import bcrypt from 'bcrypt'
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateConfirmPassword,
} from '../utils/validate.js'

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const BCRYPT_COST = 12

export async function register(prisma, { email, username, password, confirmPassword }) {
  if (validateEmail(email)) throw new AuthError('INVALID_EMAIL', validateEmail(email))
  if (validateUsername(username)) throw new AuthError('INVALID_USERNAME', validateUsername(username))
  if (validatePassword(password)) throw new AuthError('INVALID_PASSWORD', validatePassword(password))
  if (validateConfirmPassword(password, confirmPassword)) throw new AuthError('PASSWORD_MISMATCH', validateConfirmPassword(password, confirmPassword))

  const normalizedEmail = email.toLowerCase()
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  try {
    return await prisma.user.create({
      data: { email: normalizedEmail, username, passwordHash },
      select: { id: true, email: true, username: true },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.find((t) => t === 'email' || t === 'username')
      if (field === 'email') throw new AuthError('EMAIL_TAKEN', 'Email already taken')
      if (field === 'username') throw new AuthError('USERNAME_TAKEN', 'Username already taken')
    }
    throw err
  }
}
