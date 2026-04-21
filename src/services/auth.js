import bcrypt from 'bcryptjs'
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateConfirmPassword,
} from '../utils/validate.js'
import { generateResetToken, hashToken } from '../utils/token.js'
import { sendMail } from '../utils/mailer.js'

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

export async function login(prisma, { email, password }) {
  if (!email || !password) throw new AuthError('INVALID_INPUT', 'Email and password are required')
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
  })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
  }
  return { id: user.id, email: user.email, username: user.username }
}

const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function requestPasswordReset(prisma, { email }) {
  if (validateEmail(email)) throw new AuthError('INVALID_EMAIL', validateEmail(email))
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } })
  if (!user) return // silent, generic response at route level
  const raw = generateResetToken()
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  })
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset?token=${raw}`
  await sendMail({
    to: user.email,
    subject: 'Webchat — password reset',
    text: `Reset your password: ${resetUrl}\n\nLink expires in 1 hour. If you didn't request this, ignore this email.`,
  })
}

export async function resetPassword(prisma, { token, newPassword }) {
  if (validatePassword(newPassword)) throw new AuthError('INVALID_PASSWORD', validatePassword(newPassword))
  if (!token || typeof token !== 'string') throw new AuthError('INVALID_TOKEN', 'Invalid or expired token')
  const tokenHash = hashToken(token)
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } })
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.deletedAt) {
    throw new AuthError('INVALID_TOKEN', 'Invalid or expired token')
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.$executeRaw`DELETE FROM user_sessions WHERE sess->>'userId' = ${row.userId}`,
  ])
}

export async function changePassword(prisma, { userId, currentPassword, newPassword, currentSid }) {
  if (validatePassword(newPassword)) throw new AuthError('INVALID_PASSWORD', validatePassword(newPassword))
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.deletedAt || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AuthError('INVALID_CREDENTIALS', 'Current password is incorrect')
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.$executeRaw`DELETE FROM user_sessions WHERE sess->>'userId' = ${userId} AND sid <> ${currentSid}`,
  ])
}

export async function listSessions(prisma, { userId, currentSid }) {
  const rows = await prisma.user_sessions.findMany({
    where: { expire: { gt: new Date() } },
  })
  return rows
    .filter((r) => r.sess?.userId === userId)
    .map((r) => ({
      sid: r.sid,
      userAgent: r.sess.userAgent || 'Unknown',
      ip: r.sess.ip || 'Unknown',
      createdAt: r.sess.createdAt || null,
      expire: r.expire,
      isCurrent: r.sid === currentSid,
    }))
}

export async function revokeSession(prisma, { userId, sid }) {
  const row = await prisma.user_sessions.findUnique({ where: { sid } })
  if (!row || row.sess?.userId !== userId) throw new AuthError('NOT_FOUND', 'Session not found')
  await prisma.user_sessions.delete({ where: { sid } })
}

export async function deleteAccount(prisma, { userId }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.deletedAt) throw new AuthError('NOT_FOUND', 'User not found')

  await prisma.$transaction(async (tx) => {
    // Owned rooms — cascades RoomMember/Message/Attachment/RoomBan via schema
    await tx.room.deleteMany({ where: { ownerId: userId } })
    // Friendships (both directions) — explicit delete since relation is on `User`
    await tx.friendship.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } })
    // User bans (both directions)
    await tx.userBan.deleteMany({ where: { OR: [{ bannerId: userId }, { bannedId: userId }] } })
    // Notifications for this user (already cascades on User, but we're soft-deleting)
    await tx.notification.deleteMany({ where: { userId } })
    // Memberships in other rooms — user leaves
    await tx.roomMember.deleteMany({ where: { userId } })
    // Password reset tokens
    await tx.passwordResetToken.deleteMany({ where: { userId } })
    // Soft-delete the user + tombstone uniqueness fields
    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: `deleted-${userId}-${user.email}`,
        username: `deleted-${userId}-${user.username}`,
        passwordHash: '!', // intentionally invalid bcrypt hash → bcrypt.compare always returns false
      },
    })
    // Purge all session rows for this user
    await tx.$executeRaw`DELETE FROM user_sessions WHERE sess->>'userId' = ${userId}`
  })
}
