# Auth & Sessions — Design Spec

**Sub-project:** 1 of 8 (foundation) — Section 3 of `requirements.md`
**Date:** 2026-04-20

---

## Context

This is the foundation sub-project of the Webchat hackathon. Every other subsystem (rooms, messaging, presence, friends, attachments, notifications, moderation) depends on a working auth layer — user identity, session handling, and access gates.

A scaffold exists at `src/routes/auth.js` but has gaps against the spec: wrong session TTL (24h instead of 30-day sliding), no real email-based password-reset flow (the existing `/reset-password` handler is actually a password-change variant), the `PasswordResetToken` model from Section 11 is missing from `prisma/schema.prisma`, validators in `src/utils/validate.js` are not wired into any route, `nodemailer` is not installed, and `mailhog` is absent from `docker-compose.yml`. The existing code was committed without tests and `CLAUDE.md` mandates test-first TDD, so this sub-project is a from-scratch rewrite of the auth layer under TDD.

Decisions made in brainstorming (all accepted by user):

- **Account deletion:** soft-delete via `User.deletedAt` + email/username tombstone suffix, so personal message history can survive with intact author FKs (Section 3.7 "retained but frozen").
- **Sliding TTL:** use express-session `rolling: true` — built-in, no custom middleware.
- **Password reset token:** SHA-256 of crypto-random bytes (fast, constant-time, standard for short-TTL single-use tokens).
- **Post-reset/change-password:** invalidate all other sessions (enterprise security practice, not in spec but aligns with "auditability matters").
- **Frontend scope:** minimal Vue 3 forms so the subsystem is end-to-end usable and testable.
- **Mailhog:** added to `docker-compose.yml` as part of this sub-project.

---

## Architecture

### Layering

```
src/routes/auth.js         thin HTTP handlers (request/response + error mapping)
src/services/auth.js       business logic (register/login/reset/delete) — unit-testable
src/utils/validate.js      already exists, extended and wired in
src/utils/token.js         sha256 hashing + crypto-random token generation (pure)
src/utils/mailer.js        nodemailer wrapper with injectable transport (mockable)
src/middleware/auth.js     requireAuth + requireSocketAuth (existing, enhanced)
prisma/schema.prisma       + PasswordResetToken, + User.deletedAt
public/                    minimal Vue 3 forms for each auth flow
docker-compose.yml         + mailhog service, + SMTP env vars
```

Rationale: putting business logic in `src/services/auth.js` means tests exercise register/login/reset/delete without spinning up Express or hitting HTTP. Routes become ~5-line adapters. This satisfies `CLAUDE.md`'s "Keep business logic in pure utility functions separate from route handlers."

### Data Model Changes (one Prisma migration)

**1. `User` additions**

```prisma
model User {
  // ...existing fields...
  deletedAt DateTime?
  passwordResetTokens PasswordResetToken[]
}
```

Soft-delete approach uses **tombstone suffix** on `email` and `username` (rewriting both to `deleted-<userId>-<original>` at delete time). This preserves the simple `@unique` constraints in Prisma without needing a raw SQL migration for a partial unique index.

**2. New `PasswordResetToken` model** (matches Section 11 of requirements.md verbatim)

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, usedAt])
}
```

**3. `user_sessions`** (managed by connect-pg-simple) stays as-is. Session payload JSON carries `{ userId, userAgent, ip, createdAt }`.

---

## Session Strategy

`express-session` config in `src/index.js`:

```js
{
  store: new PgSession({ conString: DATABASE_URL, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: SESSION_SECRET,
  rolling: true,         // sliding TTL on every request
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
  },
}
```

On login:

- `persistent: true`  → `req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000` (30 days). `rolling: true` means each authenticated request pushes `expire` forward.
- `persistent: false` → leave `cookie.maxAge` unset → browser-session cookie.

Session payload set at login:

```js
req.session.userId = user.id
req.session.userAgent = req.headers['user-agent'] || 'Unknown'
req.session.ip = req.ip
req.session.createdAt = new Date().toISOString()
```

---

## HTTP Endpoints (all under `/api/auth`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST   | `/register`           | —   | Create user + auto sign-in (non-persistent) |
| POST   | `/login`              | —   | Sign in; `persistent` flag drives cookie TTL |
| POST   | `/logout`             | ✓   | Destroy current session only |
| GET    | `/me`                 | ✓   | Current user info |
| POST   | `/forgot-password`    | —   | Always returns generic `{ ok: true }`; emails link if email exists |
| POST   | `/reset-password`     | —   | `{ token, newPassword }` — consumes token, resets pw, kills all sessions |
| POST   | `/change-password`    | ✓   | `{ currentPassword, newPassword }` — kills all OTHER sessions |
| GET    | `/sessions`           | ✓   | List caller's sessions with `isCurrent` flag |
| DELETE | `/sessions/:sid`      | ✓   | Revoke a session (404 if not caller's) |
| DELETE | `/account`            | ✓   | Soft-delete + cascade |

### Password Reset Flow (Section 3.4)

1. `POST /forgot-password { email }` → always returns `{ ok: true }`.
   - If a matching active user exists: generate 32 random bytes (`crypto.randomBytes(32).toString('hex')`), compute `sha256(token)` as `tokenHash`, insert `PasswordResetToken` with `expiresAt = now + 1h` and `usedAt = null`, send email via `mailer` with link `${APP_URL}/reset?token=<raw>`.
   - If no match (or soft-deleted user): no row, no email — same generic response.
2. User clicks link → frontend `/reset?token=...` renders "set new password" form.
3. `POST /reset-password { token, newPassword }` → service hashes incoming token, looks up row, verifies `usedAt IS NULL`, `expiresAt > now`, and the linked `User.deletedAt IS NULL` (soft-delete invalidates outstanding tokens), updates `User.passwordHash`, sets `usedAt = now()`, deletes all `user_sessions` rows for that user. Returns generic error on any failure path so tokens can't be probed.

### Account Deletion (`DELETE /account`)

Inside a Prisma `$transaction`:

1. `prisma.room.deleteMany({ where: { ownerId: userId } })` — cascades RoomMember, Message, RoomBan, Attachment per existing schema.
2. Other relations cascade automatically via existing `onDelete: Cascade` (Friendship, UserBan, Notification, RoomMember, PasswordResetToken).
3. `UPDATE User SET email = concat('deleted-', id, '-', email), username = concat('deleted-', id, '-', username), passwordHash = '!', deletedAt = now() WHERE id = ?`.
4. Delete all `user_sessions` rows matching caller's `userId` (raw SQL: `DELETE FROM user_sessions WHERE sess->>'userId' = $1`).
5. `req.session.destroy()` and `res.clearCookie('connect.sid')`.

Messages the user sent in other users' rooms remain in DB; `Message.authorId` still resolves to the soft-deleted row, and the UI renders username as "Deleted user" when `deletedAt IS NOT NULL`.

### Middleware

`requireAuth` (existing): keeps its current shape but will refuse if the resolved user has `deletedAt IS NOT NULL` (belt-and-braces; sessions are already purged at deletion, but this guards against edge cases).

---

## Email Transport

`src/utils/mailer.js`:

```js
import nodemailer from 'nodemailer'

let transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailhog',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
})

export function setTransport(t) { transport = t }  // test seam
export async function sendMail(opts) { return transport.sendMail(opts) }
```

Tests inject a capture stub via `setTransport`. No `nodemailer-mock` dependency needed.

---

## Docker Compose Changes

Add third service to `docker-compose.yml`:

```yaml
mailhog:
  image: mailhog/mailhog
  ports:
    - "8025:8025"   # Web UI
```

Add env to `app` service:

```yaml
SMTP_HOST: mailhog
SMTP_PORT: 1025
SMTP_FROM: noreply@webchat.local
APP_URL: http://localhost:3000
```

---

## Frontend (minimal Vue 3, CDN)

Single-page Vue app in `public/app.js` with routed views:

- `/` — if not authed, redirect to `/login`
- `/register` — email + username + password + confirm
- `/login` — email + password + "Keep me signed in" checkbox
- `/forgot` — email
- `/reset?token=...` — new password + confirm
- `/profile` — change password, list sessions (with Revoke button per row), Delete account button with confirm modal

No build step per `CLAUDE.md` ("Vue.js 3 (CDN, no build step)").

---

## Test Scenarios (approved in brainstorming — business-language gate per CLAUDE.md)

### A. Registration

1. Valid email + username + password matching confirm → user row created; caller auto-logged-in with non-persistent cookie; password stored as bcrypt hash.
2. Email already in use by active user → 409.
3. Username already in use by active user → 409.
4. Email previously used by a soft-deleted user → succeeds (tombstone freed it).
5. Invalid email format → 400.
6. Username failing `^[a-zA-Z0-9_-]{3,32}$` → 400.
7. Password shorter than 6 chars → 400.
8. `password ≠ confirmPassword` → 400.
9. Missing required field → 400.

### B. Sign In

10. Correct credentials + `persistent: true` → 200 + `Set-Cookie` with `Max-Age ≈ 30 days`; session payload contains userId, userAgent, ip, createdAt.
11. Correct credentials + `persistent: false` → 200 + `Set-Cookie` without `Max-Age`.
12. Wrong password → 401 generic "Invalid email or password".
13. Unknown email → 401 with same generic message (no enumeration).
14. Soft-deleted user's email → 401 generic.
15. Missing email or password → 400.

### C. Sliding TTL

16. Authenticated request on persistent session refreshes `Set-Cookie` with `Max-Age` pushed forward.
17. Non-persistent session: authenticated request does not add `Max-Age`.

### D. Sign Out

18. Authenticated → current session row gone from `user_sessions`, cookie cleared, 200.
19. Second session on another device remains valid after first signs out.
20. Unauthenticated → 401.

### E. Forgot Password

21. Known email → 200 generic; `PasswordResetToken` row with `expiresAt ≈ now+1h` and `usedAt = null`; captured email body contains link with `token=` query parameter.
22. Unknown email → 200 generic; no token row; no email sent.
23. Soft-deleted user's email → 200 generic; no token row; no email.
24. Malformed email → 400.
25. `tokenHash` stored in DB is sha256, never the raw token.

### F. Reset Password

26. Valid unused unexpired token + new password ≥ 6 chars → 200; old password no longer works; new password works; token marked `usedAt`; all sessions for user deleted.
27. Same token reused → 400.
28. Expired token → 400.
29. Unknown token → 400.
30. New password failing validator → 400.
30a. Token belongs to a user who was soft-deleted after token issuance → 400.

### G. Change Password

31. Correct current + valid new → 200; hash updated; other sessions deleted; current session survives.
32. Wrong current → 401.
33. New password failing validator → 400.
34. Unauthenticated → 401.

### H. Sessions List & Revoke

35. Returns only caller's sessions with sid, userAgent, ip, createdAt, expire, isCurrent.
36. Does not leak another user's sessions even by guessed sid.
37. DELETE own non-current session → row deleted, other sessions untouched, 200.
38. DELETE current session → destroyed, cookie cleared, 200.
39. DELETE session not belonging to caller → 404 (not 403).
40. Unauthenticated → 401.

### I. Account Deletion

41. Authenticated → rooms owned by user deleted; friendships gone; notifications gone; `User.deletedAt` non-null; email/username tombstoned; all sessions removed; caller's cookie cleared.
42. Messages sent by user in rooms owned by others remain in DB with `authorId` intact.
43. Login with deleted user's original email → 401.
44. Re-registering with original email or username → succeeds.
45. Unauthenticated → 401.

### J. Cross-cutting

46. All authenticated routes reject missing/invalid session with 401.
47. Password hashes are bcrypt with cost ≥ 10 (hash prefix `$2b$1`).

---

## Out of Scope (explicit)

- Rate limiting, CSRF tokens, 2FA, email verification, audit log — not in requirements, YAGNI for hackathon.
- File cleanup on disk for deleted rooms — owned by Attachments sub-project.
- Admin-initiated account actions — owned by Admin/moderation sub-project.
- Socket.io auth gate for room events — owned by Rooms sub-project (auth middleware exports `requireSocketAuth` which that project will use).

---

## Critical Files to be Modified

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `User.deletedAt`; add `PasswordResetToken` model |
| `prisma/migrations/<ts>_auth_sessions/migration.sql` | Generated by `prisma migrate dev` |
| `src/index.js` | Update session config to `rolling: true` |
| `src/routes/auth.js` | Rewrite — thin adapters calling `services/auth.js` |
| `src/services/auth.js` | **NEW** — all business logic |
| `src/utils/validate.js` | Extend: `validateConfirmPassword`, reuse existing validators |
| `src/utils/token.js` | **NEW** — `generateResetToken()`, `hashToken()` |
| `src/utils/mailer.js` | **NEW** — `sendMail`, `setTransport` |
| `src/middleware/auth.js` | Add `deletedAt` check |
| `src/__tests__/auth.services.test.js` | **NEW** — unit tests for service layer |
| `src/__tests__/auth.routes.test.js` | **NEW** — integration tests via supertest |
| `src/__tests__/mailer.test.js` | **NEW** — mailer stub test |
| `public/index.html`, `public/app.js`, `public/styles.css` | Vue forms for register/login/forgot/reset/profile |
| `docker-compose.yml` | Add `mailhog` service + SMTP env on `app` |
| `package.json` | Add `nodemailer` dependency |

---

## Verification

End-to-end verification steps after implementation:

1. `npm run test:run` — all scenarios A–J pass green.
2. `npm run lint` — no errors.
3. `npm run typecheck` — no errors.
4. `docker compose up --build` — all three services start (app, postgres, mailhog).
5. Open `http://localhost:3000/register` → register a user → automatically redirected to `/profile`.
6. Sign out → sign in with "Keep me signed in" checked → close browser → reopen → still signed in.
7. Open a second browser (or incognito) → sign in same user → both sessions appear in `/profile` sessions list.
8. Revoke the first session from browser 2 → browser 1 refresh → redirected to login.
9. Click "Forgot password" → enter email → open `http://localhost:8025` (Mailhog UI) → find email → click reset link → set new password → redirected to login → sign in with new password.
10. Change password from `/profile` → confirm current session still valid; any other sessions are dropped.
11. Delete account → confirm modal → redirected to login; try logging in with old email → "Invalid email or password".
12. Re-register with the same email/username → succeeds.
