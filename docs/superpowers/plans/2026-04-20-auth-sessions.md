# Auth & Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Webchat auth & sessions layer end-to-end (registration, sign-in with "Keep me signed in", sign-out, email-based password reset via Mailhog, password change, session management, soft-delete account) under TDD.

**Architecture:** Three-layer split — routes (thin adapters) → services (business logic, DB-backed) → utils (pure). Sessions in Postgres via `connect-pg-simple` with `rolling: true` for 30-day sliding TTL. Password reset through Mailhog + SHA-256-hashed single-use tokens. Account deletion is soft (tombstone suffix on email/username) so personal message history survives.

**Tech Stack:** Node.js, Express 4, Socket.io 4, Prisma 5 + PostgreSQL 16, express-session + connect-pg-simple, bcrypt, nodemailer + Mailhog, Vitest + supertest, Vue 3 (CDN).

**Canonical spec:** `docs/superpowers/specs/2026-04-20-auth-sessions-design.md` (committed — any ambiguity resolved in favour of the spec).

---

## Context

Foundation sub-project (#1 of 8). Every later subsystem depends on a working auth gate. Scaffold at `src/routes/auth.js` exists but is off-spec (wrong TTL, no real reset-flow, no `PasswordResetToken` model, validators unused, `nodemailer` not installed, `mailhog` missing from compose). CLAUDE.md mandates TDD (Iron Law: no production code without a failing test). Plan rewrites the auth layer under TDD, adds a real Postgres test harness (first in the codebase — later sub-projects reuse it), wires Mailhog, and ships a minimal Vue UI.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | **Modify** — add `User.deletedAt`, new `PasswordResetToken` model |
| `prisma/migrations/<ts>_auth_sessions/migration.sql` | **Generated** by `prisma migrate dev` |
| `prisma/init-test-db.sql` | **New** — creates `webchat_test` DB on postgres container startup |
| `src/index.js` | **Modify** — session config: `rolling: true`, cookie options |
| `src/routes/auth.js` | **Rewrite** — thin adapters only |
| `src/services/auth.js` | **New** — all business logic (register, login, reset, delete, etc.) |
| `src/utils/validate.js` | **Modify** — add `validateConfirmPassword` |
| `src/utils/token.js` | **New** — `generateResetToken()`, `hashToken()` |
| `src/utils/mailer.js` | **New** — nodemailer wrapper with `setTransport` test seam |
| `src/middleware/auth.js` | **Modify** — add `deletedAt IS NULL` check |
| `src/__tests__/helpers/db.js` | **New** — `testPrisma`, `resetDb()` test-DB helper |
| `src/__tests__/helpers/app.js` | **New** — build an Express app for supertest, share session middleware |
| `src/__tests__/token.test.js` | **New** — pure unit tests |
| `src/__tests__/validate.test.js` | **Modify** — add confirmPassword cases |
| `src/__tests__/mailer.test.js` | **New** — transport stub test |
| `src/__tests__/services/auth.register.test.js` | **New** — register DB tests |
| `src/__tests__/services/auth.login.test.js` | **New** — login DB tests |
| `src/__tests__/services/auth.passwordReset.test.js` | **New** — forgot/reset DB tests |
| `src/__tests__/services/auth.passwordChange.test.js` | **New** |
| `src/__tests__/services/auth.sessions.test.js` | **New** — list + revoke |
| `src/__tests__/services/auth.deleteAccount.test.js` | **New** |
| `src/__tests__/routes/auth.integration.test.js` | **New** — supertest end-to-end (cookies, sliding TTL, generic errors) |
| `docker-compose.yml` | **Modify** — add `mailhog` service; expose postgres port 5432; mount init script |
| `public/index.html` | **Rewrite** — Vue 3 CDN app shell |
| `public/app.js` | **Rewrite** — routed Vue app (register, login, forgot, reset, profile) |
| `public/styles.css` | **Modify** — minimal form styles |
| `package.json` | **Modify** — add `nodemailer` (already has supertest, vitest, dotenv) |
| `vitest.config.js` | **Modify** — add `setupFiles` that loads `.env.test` |
| `.env.test` | **New** — `DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat_test`, SMTP pointing at a captured transport |

Running tests requires `docker compose up -d postgres mailhog` first. The lint-staged pre-commit hook runs tests on every commit — developer must have postgres+mailhog running locally.

---

## Task 1: Dev dependencies, test DB harness, env wiring

**Files:**
- Modify: `package.json`
- Modify: `docker-compose.yml`
- Create: `prisma/init-test-db.sql`
- Create: `.env.test`
- Modify: `vitest.config.js`
- Create: `src/__tests__/helpers/db.js`
- Create: `src/__tests__/helpers/app.js`
- Create: `src/__tests__/harness.test.js` (meta-test proving the harness works)

- [ ] **Step 1.1: Install nodemailer**

```bash
npm install nodemailer
```

- [ ] **Step 1.2: Expose postgres port + add init script to docker-compose.yml**

In `docker-compose.yml`, under `postgres`:
```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: webchat
    POSTGRES_PASSWORD: webchat
    POSTGRES_DB: webchat
  ports:
    - "5432:5432"            # NEW — for local test runner
  volumes:
    - pgdata:/var/lib/postgresql/data
    - ./prisma/init-test-db.sql:/docker-entrypoint-initdb.d/10-init-test-db.sql:ro   # NEW
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U webchat"]
    interval: 5s
    timeout: 5s
    retries: 10
```

- [ ] **Step 1.3: Create `prisma/init-test-db.sql`**

```sql
-- Creates the companion test database on first container start.
-- Runs once thanks to Postgres docker-entrypoint-initdb.d contract.
CREATE DATABASE webchat_test OWNER webchat;
```

- [ ] **Step 1.4: Create `.env.test`**

```
DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat_test
SESSION_SECRET=test-secret
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@webchat.local
APP_URL=http://localhost:3000
NODE_ENV=test
```

- [ ] **Step 1.5: Update `vitest.config.js` to load `.env.test`**

```js
import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.test' })

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/__tests__/**/*.test.js'],
    testTimeout: 10000,
  },
})
```

- [ ] **Step 1.6: Create `src/__tests__/helpers/db.js`**

```js
import { PrismaClient } from '@prisma/client'

export const testPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })

// Truncate all domain tables + session store. Order doesn't matter with CASCADE.
export async function resetDb() {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Attachment",
      "Message",
      "RoomMember",
      "RoomBan",
      "Room",
      "Notification",
      "Friendship",
      "UserBan",
      "PasswordResetToken",
      "User",
      "user_sessions"
    RESTART IDENTITY CASCADE;
  `)
}
```

- [ ] **Step 1.7: Create `src/__tests__/helpers/app.js`**

```js
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import authRouter from '../../routes/auth.js'
import { testPrisma } from './db.js'

const PgSession = connectPgSimple(session)

// Builds an Express app that mirrors src/index.js session config but is isolated for tests.
export function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use(session({
    store: new PgSession({ conString: process.env.DATABASE_URL, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    rolling: true,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false },
  }))
  app.locals.prisma = testPrisma
  app.use('/api/auth', authRouter)
  return app
}
```

- [ ] **Step 1.8: Write harness meta-test at `src/__tests__/harness.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from './helpers/db.js'

describe('test DB harness', () => {
  beforeEach(async () => { await resetDb() })

  it('connects and starts empty', async () => {
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  it('resetDb wipes users between tests', async () => {
    await testPrisma.user.create({ data: { email: 'a@b.c', username: 'aaa', passwordHash: 'x' } })
    expect(await testPrisma.user.count()).toBe(1)
  })
})
```

- [ ] **Step 1.9: Run the harness test (expected to fail: `webchat_test` DB doesn't exist yet + schema out of date)**

```bash
docker compose up -d postgres
npm run test:run -- harness
```

Expected: FAIL — DB missing or Prisma client missing `PasswordResetToken` / `deletedAt`. That's fine; Task 2 creates the migration.

- [ ] **Step 1.10: Commit**

```bash
git add package.json package-lock.json docker-compose.yml prisma/init-test-db.sql .env.test vitest.config.js src/__tests__/helpers src/__tests__/harness.test.js
git commit -m "chore(auth): test DB harness + nodemailer dep"
```

---

## Task 2: Prisma schema — soft-delete + password reset token

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: `prisma/migrations/<ts>_auth_sessions/migration.sql`

- [ ] **Step 2.1: Modify `prisma/schema.prisma`**

In the `User` model, add:
```prisma
  deletedAt           DateTime?
  passwordResetTokens PasswordResetToken[]
```

At the bottom of the file (before `enum FriendStatus`), add:
```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, usedAt])
}
```

- [ ] **Step 2.2: Generate + apply migration**

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat \
  npx prisma migrate dev --name auth_sessions
DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat_test \
  npx prisma migrate deploy
```

This updates both the dev DB and the test DB with the new schema, and generates the Prisma client.

- [ ] **Step 2.3: Re-run the harness test**

```bash
npm run test:run -- harness
```

Expected: PASS (both tests green).

- [ ] **Step 2.4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): add User.deletedAt + PasswordResetToken model"
```

---

## Task 3: `src/utils/token.js` — random token + sha256 hash (pure)

**Files:**
- Create: `src/utils/token.js`
- Create: `src/__tests__/token.test.js`

- [ ] **Step 3.1: Write the failing test at `src/__tests__/token.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { generateResetToken, hashToken } from '../utils/token.js'
import crypto from 'crypto'

describe('generateResetToken', () => {
  it('returns 64-char hex string', () => {
    const t = generateResetToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a different token each call', () => {
    expect(generateResetToken()).not.toBe(generateResetToken())
  })
})

describe('hashToken', () => {
  it('returns sha256 hex of input', () => {
    const raw = 'abc'
    const expected = crypto.createHash('sha256').update(raw).digest('hex')
    expect(hashToken(raw)).toBe(expected)
  })

  it('is deterministic', () => {
    expect(hashToken('x')).toBe(hashToken('x'))
  })
})
```

- [ ] **Step 3.2: Run — expect FAIL ("module not found")**

```bash
npm run test:run -- token
```

- [ ] **Step 3.3: Implement `src/utils/token.js`**

```js
import crypto from 'crypto'

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}
```

- [ ] **Step 3.4: Run — expect PASS**

```bash
npm run test:run -- token
```

- [ ] **Step 3.5: Commit**

```bash
git add src/utils/token.js src/__tests__/token.test.js
git commit -m "feat(auth): token utility (generate + sha256 hash)"
```

---

## Task 4: `src/utils/validate.js` — confirmPassword extension

**Files:**
- Modify: `src/utils/validate.js`
- Modify: `src/__tests__/validate.test.js`

- [ ] **Step 4.1: Add failing tests at the bottom of `src/__tests__/validate.test.js`**

```js
import { validateConfirmPassword } from '../utils/validate.js'

describe('validateConfirmPassword', () => {
  it('returns null when passwords match', () => {
    expect(validateConfirmPassword('abcdef', 'abcdef')).toBeNull()
  })
  it('rejects when passwords differ', () => {
    expect(validateConfirmPassword('abcdef', 'abcdeg')).not.toBeNull()
  })
  it('rejects missing confirmPassword', () => {
    expect(validateConfirmPassword('abcdef', '')).not.toBeNull()
  })
})
```

- [ ] **Step 4.2: Run — expect FAIL ("validateConfirmPassword is not a function")**

```bash
npm run test:run -- validate
```

- [ ] **Step 4.3: Add to `src/utils/validate.js`**

```js
export function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) return 'Password confirmation is required'
  if (password !== confirmPassword) return 'Passwords do not match'
  return null
}
```

- [ ] **Step 4.4: Run — expect PASS**

- [ ] **Step 4.5: Commit**

```bash
git add src/utils/validate.js src/__tests__/validate.test.js
git commit -m "feat(auth): add validateConfirmPassword"
```

---

## Task 5: `src/utils/mailer.js` — nodemailer wrapper with test seam

**Files:**
- Create: `src/utils/mailer.js`
- Create: `src/__tests__/mailer.test.js`

- [ ] **Step 5.1: Write failing test at `src/__tests__/mailer.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { sendMail, setTransport } from '../utils/mailer.js'

describe('mailer', () => {
  it('forwards sendMail to the injected transport', async () => {
    const calls = []
    setTransport({ sendMail: async (opts) => { calls.push(opts); return { messageId: 'test' } } })
    const res = await sendMail({ to: 'x@y.z', subject: 's', text: 't' })
    expect(res.messageId).toBe('test')
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe('x@y.z')
  })
})
```

- [ ] **Step 5.2: Run — expect FAIL ("module not found")**

```bash
npm run test:run -- mailer
```

- [ ] **Step 5.3: Implement `src/utils/mailer.js`**

```js
import nodemailer from 'nodemailer'

let transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailhog',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
})

export function setTransport(t) { transport = t }
export async function sendMail(opts) {
  const from = opts.from || process.env.SMTP_FROM || 'noreply@webchat.local'
  return transport.sendMail({ from, ...opts })
}
```

- [ ] **Step 5.4: Run — expect PASS**

- [ ] **Step 5.5: Commit**

```bash
git add src/utils/mailer.js src/__tests__/mailer.test.js
git commit -m "feat(auth): mailer wrapper with injectable transport"
```

---

## Task 6: `src/services/auth.js` — `register(prisma, input)`

**Files:**
- Create: `src/services/auth.js`
- Create: `src/__tests__/services/auth.register.test.js`

- [ ] **Step 6.1: Write failing tests at `src/__tests__/services/auth.register.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, AuthError } from '../../services/auth.js'

const valid = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('register', () => {
  beforeEach(async () => { await resetDb() })

  it('creates a user and returns id/email/username', async () => {
    const user = await register(testPrisma, valid)
    expect(user).toMatchObject({ email: 'a@b.c', username: 'alice' })
    expect(user.id).toBeDefined()
  })

  it('stores a bcrypt hash (cost >= 10), never plaintext', async () => {
    await register(testPrisma, valid)
    const row = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    expect(row.passwordHash).toMatch(/^\$2[aby]\$1\d\$/)
    expect(await bcrypt.compare('pw1234', row.passwordHash)).toBe(true)
  })

  it('lowercases the email', async () => {
    await register(testPrisma, { ...valid, email: 'A@B.C' })
    const row = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    expect(row).toBeTruthy()
  })

  it('rejects duplicate active email with EMAIL_TAKEN', async () => {
    await register(testPrisma, valid)
    await expect(register(testPrisma, { ...valid, username: 'other' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('rejects duplicate active username with USERNAME_TAKEN', async () => {
    await register(testPrisma, valid)
    await expect(register(testPrisma, { ...valid, email: 'x@y.z' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN' })
  })

  it('rejects invalid email', async () => {
    await expect(register(testPrisma, { ...valid, email: 'bad' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  })

  it('rejects invalid username', async () => {
    await expect(register(testPrisma, { ...valid, username: 'a b' })).rejects.toMatchObject({ code: 'INVALID_USERNAME' })
  })

  it('rejects short password', async () => {
    await expect(register(testPrisma, { ...valid, password: 'abc', confirmPassword: 'abc' })).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })

  it('rejects mismatched confirmPassword', async () => {
    await expect(register(testPrisma, { ...valid, confirmPassword: 'different' })).rejects.toMatchObject({ code: 'PASSWORD_MISMATCH' })
  })

  it('allows re-registering an email freed by a soft-deleted user', async () => {
    const u = await register(testPrisma, valid)
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(),
      email: `deleted-${u.id}-a@b.c`,
      username: `deleted-${u.id}-alice`,
    }})
    await expect(register(testPrisma, valid)).resolves.toMatchObject({ email: 'a@b.c' })
  })
})
```

- [ ] **Step 6.2: Run — expect FAIL**

```bash
npm run test:run -- services/auth.register
```

- [ ] **Step 6.3: Implement `src/services/auth.js` (start the file + register)**

```js
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
```

- [ ] **Step 6.4: Run — expect PASS**

- [ ] **Step 6.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.register.test.js
git commit -m "feat(auth): register() service"
```

---

## Task 7: `src/services/auth.js` — `login(prisma, input)`

**Files:**
- Modify: `src/services/auth.js`
- Create: `src/__tests__/services/auth.login.test.js`

- [ ] **Step 7.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, login, AuthError } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('login', () => {
  beforeEach(async () => { await resetDb(); await register(testPrisma, creds) })

  it('returns the user on correct credentials', async () => {
    const u = await login(testPrisma, { email: 'a@b.c', password: 'pw1234' })
    expect(u).toMatchObject({ email: 'a@b.c', username: 'alice' })
  })

  it('lowercases email lookup', async () => {
    await expect(login(testPrisma, { email: 'A@B.C', password: 'pw1234' })).resolves.toBeTruthy()
  })

  it('throws INVALID_CREDENTIALS on wrong password', async () => {
    await expect(login(testPrisma, { email: 'a@b.c', password: 'WRONG' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('throws INVALID_CREDENTIALS on unknown email (no enumeration)', async () => {
    await expect(login(testPrisma, { email: 'nope@b.c', password: 'pw1234' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('throws INVALID_CREDENTIALS for soft-deleted user (looking up original email)', async () => {
    const u = await testPrisma.user.findUnique({ where: { email: 'a@b.c' } })
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(),
      email: `deleted-${u.id}-a@b.c`,
      username: `deleted-${u.id}-alice`,
    }})
    await expect(login(testPrisma, { email: 'a@b.c', password: 'pw1234' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rejects missing fields with INVALID_INPUT', async () => {
    await expect(login(testPrisma, { email: '', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
```

- [ ] **Step 7.2: Run — expect FAIL**

- [ ] **Step 7.3: Add to `src/services/auth.js`**

```js
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
```

- [ ] **Step 7.4: Run — expect PASS**

- [ ] **Step 7.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.login.test.js
git commit -m "feat(auth): login() service"
```

---

## Task 8: `src/services/auth.js` — password reset (forgot + reset)

**Files:**
- Modify: `src/services/auth.js`
- Create: `src/__tests__/services/auth.passwordReset.test.js`

- [ ] **Step 8.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, requestPasswordReset, resetPassword, AuthError } from '../../services/auth.js'
import { hashToken } from '../../utils/token.js'
import { setTransport } from '../../utils/mailer.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('requestPasswordReset', () => {
  let captured
  beforeEach(async () => {
    await resetDb()
    captured = []
    setTransport({ sendMail: async (opts) => { captured.push(opts); return { messageId: 'x' } } })
  })

  it('creates a token and sends email for a known address', async () => {
    const u = await register(testPrisma, creds)
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: u.id } })
    expect(tokens).toHaveLength(1)
    const t = tokens[0]
    expect(t.usedAt).toBeNull()
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000)
    expect(t.expiresAt.getTime()).toBeLessThan(Date.now() + 70 * 60 * 1000)
    expect(captured).toHaveLength(1)
    expect(captured[0].to).toBe('a@b.c')
    expect(captured[0].text + (captured[0].html || '')).toMatch(/token=[0-9a-f]{64}/)
  })

  it('returns silently (no email, no token) for unknown email', async () => {
    await requestPasswordReset(testPrisma, { email: 'nobody@x.y' })
    expect(await testPrisma.passwordResetToken.count()).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('returns silently for soft-deleted users', async () => {
    const u = await register(testPrisma, creds)
    await testPrisma.user.update({ where: { id: u.id }, data: {
      deletedAt: new Date(), email: `deleted-${u.id}-a@b.c`, username: `deleted-${u.id}-alice`,
    }})
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    expect(await testPrisma.passwordResetToken.count()).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('stores sha256 tokenHash — never raw', async () => {
    const u = await register(testPrisma, creds)
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    const raw = captured[0].text.match(/token=([0-9a-f]{64})/)[1]
    const t = await testPrisma.passwordResetToken.findFirst({ where: { userId: u.id } })
    expect(t.tokenHash).toBe(hashToken(raw))
    expect(t.tokenHash).not.toBe(raw)
  })

  it('rejects malformed email', async () => {
    await expect(requestPasswordReset(testPrisma, { email: 'bad' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  })
})

describe('resetPassword', () => {
  let userId, rawToken
  beforeEach(async () => {
    await resetDb()
    const captured = []
    setTransport({ sendMail: async (opts) => { captured.push(opts); return { messageId: 'x' } } })
    const u = await register(testPrisma, creds)
    userId = u.id
    await requestPasswordReset(testPrisma, { email: 'a@b.c' })
    rawToken = captured[0].text.match(/token=([0-9a-f]{64})/)[1]
  })

  it('resets password, marks token used, deletes all sessions for the user', async () => {
    // seed a session row for this user
    await testPrisma.user_sessions.create({ data: {
      sid: 'fake-sid', sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000),
    }})
    await resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' })
    const row = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(await bcrypt.compare('newpass1', row.passwordHash)).toBe(true)
    expect(await bcrypt.compare('pw1234', row.passwordHash)).toBe(false)
    const t = await testPrisma.passwordResetToken.findFirst({ where: { userId } })
    expect(t.usedAt).toBeTruthy()
    expect(await testPrisma.user_sessions.count()).toBe(0)
  })

  it('rejects reused token', async () => {
    await resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' })
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass2' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects expired token', async () => {
    await testPrisma.passwordResetToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects unknown token', async () => {
    await expect(resetPassword(testPrisma, { token: 'f'.repeat(64), newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects if user was soft-deleted after token issuance', async () => {
    await testPrisma.user.update({ where: { id: userId }, data: {
      deletedAt: new Date(), email: `deleted-${userId}-a@b.c`, username: `deleted-${userId}-alice`,
    }})
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'newpass1' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects weak new password', async () => {
    await expect(resetPassword(testPrisma, { token: rawToken, newPassword: 'abc' }))
      .rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })
})
```

- [ ] **Step 8.2: Run — expect FAIL**

- [ ] **Step 8.3: Add to `src/services/auth.js`**

```js
import { generateResetToken, hashToken } from '../utils/token.js'
import { sendMail } from '../utils/mailer.js'

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
```

- [ ] **Step 8.4: Run — expect PASS**

- [ ] **Step 8.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.passwordReset.test.js
git commit -m "feat(auth): password reset request + consume"
```

---

## Task 9: `src/services/auth.js` — `changePassword(prisma, input)`

**Files:**
- Modify: `src/services/auth.js`
- Create: `src/__tests__/services/auth.passwordChange.test.js`

- [ ] **Step 9.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, changePassword } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('changePassword', () => {
  let userId
  beforeEach(async () => {
    await resetDb()
    const u = await register(testPrisma, creds)
    userId = u.id
    // seed current + other sessions
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 'current-sid', sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000) },
      { sid: 'other-sid',   sess: { userId, cookie: {} }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('updates hash, keeps current session, kills others', async () => {
    await changePassword(testPrisma, { userId, currentPassword: 'pw1234', newPassword: 'brandnew1', currentSid: 'current-sid' })
    const row = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(await bcrypt.compare('brandnew1', row.passwordHash)).toBe(true)
    const rows = await testPrisma.user_sessions.findMany()
    expect(rows.map(r => r.sid)).toEqual(['current-sid'])
  })

  it('rejects wrong currentPassword', async () => {
    await expect(changePassword(testPrisma, { userId, currentPassword: 'WRONG', newPassword: 'brandnew1', currentSid: 'current-sid' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rejects weak new password', async () => {
    await expect(changePassword(testPrisma, { userId, currentPassword: 'pw1234', newPassword: 'abc', currentSid: 'current-sid' }))
      .rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })
})
```

- [ ] **Step 9.2: Run — expect FAIL**

- [ ] **Step 9.3: Add to `src/services/auth.js`**

```js
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
```

- [ ] **Step 9.4: Run — expect PASS**

- [ ] **Step 9.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.passwordChange.test.js
git commit -m "feat(auth): changePassword() keeps current session, kills others"
```

---

## Task 10: `src/services/auth.js` — `listSessions` + `revokeSession`

**Files:**
- Modify: `src/services/auth.js`
- Create: `src/__tests__/services/auth.sessions.test.js`

- [ ] **Step 10.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, listSessions, revokeSession, AuthError } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('listSessions / revokeSession', () => {
  let userId, otherId
  beforeEach(async () => {
    await resetDb()
    userId  = (await register(testPrisma, creds)).id
    otherId = (await register(testPrisma, { ...creds, email: 'b@b.c', username: 'bob' })).id
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 's1', sess: { userId, userAgent: 'UA1', ip: '1.1.1.1', createdAt: '2026-01-01' }, expire: new Date(Date.now() + 60000) },
      { sid: 's2', sess: { userId, userAgent: 'UA2', ip: '2.2.2.2', createdAt: '2026-01-02' }, expire: new Date(Date.now() + 60000) },
      { sid: 'x1', sess: { userId: otherId, cookie: {} }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('lists only caller sessions, with isCurrent flag', async () => {
    const sessions = await listSessions(testPrisma, { userId, currentSid: 's1' })
    expect(sessions).toHaveLength(2)
    expect(sessions.find(s => s.sid === 's1').isCurrent).toBe(true)
    expect(sessions.find(s => s.sid === 's2').isCurrent).toBe(false)
    expect(sessions.every(s => s.sid !== 'x1')).toBe(true)
  })

  it('revokes own session', async () => {
    await revokeSession(testPrisma, { userId, sid: 's2' })
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 's2' } })).toBeNull()
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 's1' } })).toBeTruthy()
  })

  it('throws NOT_FOUND for another user session', async () => {
    await expect(revokeSession(testPrisma, { userId, sid: 'x1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await testPrisma.user_sessions.findUnique({ where: { sid: 'x1' } })).toBeTruthy()
  })

  it('throws NOT_FOUND for missing sid', async () => {
    await expect(revokeSession(testPrisma, { userId, sid: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
```

- [ ] **Step 10.2: Run — expect FAIL**

- [ ] **Step 10.3: Add to `src/services/auth.js`**

```js
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
```

- [ ] **Step 10.4: Run — expect PASS**

- [ ] **Step 10.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.sessions.test.js
git commit -m "feat(auth): list + revoke sessions"
```

---

## Task 11: `src/services/auth.js` — `deleteAccount(prisma, userId)`

**Files:**
- Modify: `src/services/auth.js`
- Create: `src/__tests__/services/auth.deleteAccount.test.js`

- [ ] **Step 11.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { register, deleteAccount } from '../../services/auth.js'

const creds = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }

describe('deleteAccount', () => {
  let userId, friendId
  beforeEach(async () => {
    await resetDb()
    userId = (await register(testPrisma, creds)).id
    friendId = (await register(testPrisma, { ...creds, email: 'b@b.c', username: 'bob' })).id
    // seed: own room + friend room where user is a message-sender
    const ownRoom = await testPrisma.room.create({ data: { name: 'alices-room', ownerId: userId } })
    await testPrisma.roomMember.create({ data: { userId, roomId: ownRoom.id, isAdmin: true } })
    const bobRoom = await testPrisma.room.create({ data: { name: 'bobs-room', ownerId: friendId } })
    await testPrisma.roomMember.createMany({ data: [
      { userId: friendId, roomId: bobRoom.id, isAdmin: true },
      { userId, roomId: bobRoom.id },
    ]})
    await testPrisma.message.create({ data: { roomId: bobRoom.id, authorId: userId, content: 'hi' } })
    await testPrisma.friendship.create({ data: { requesterId: userId, addresseeId: friendId, status: 'ACCEPTED' } })
    await testPrisma.user_sessions.createMany({ data: [
      { sid: 'a1', sess: { userId }, expire: new Date(Date.now() + 60000) },
      { sid: 'b1', sess: { userId: friendId }, expire: new Date(Date.now() + 60000) },
    ]})
  })

  it('deletes owned rooms, frees email/username, tombstones fields, keeps messages in others rooms', async () => {
    await deleteAccount(testPrisma, { userId })
    const u = await testPrisma.user.findUnique({ where: { id: userId } })
    expect(u.deletedAt).toBeTruthy()
    expect(u.email).toBe(`deleted-${userId}-a@b.c`)
    expect(u.username).toBe(`deleted-${userId}-alice`)
    expect(await testPrisma.room.count({ where: { name: 'alices-room' } })).toBe(0)
    expect(await testPrisma.room.count({ where: { name: 'bobs-room' } })).toBe(1)
    const msg = await testPrisma.message.findFirst({ where: { authorId: userId } })
    expect(msg).toBeTruthy()                   // frozen, not deleted
    expect(msg.content).toBe('hi')
  })

  it('removes friendship and sessions', async () => {
    await deleteAccount(testPrisma, { userId })
    expect(await testPrisma.friendship.count()).toBe(0)
    const remaining = await testPrisma.user_sessions.findMany()
    expect(remaining.map(r => r.sid)).toEqual(['b1'])
  })

  it('frees original email/username for reuse', async () => {
    await deleteAccount(testPrisma, { userId })
    const reused = await register(testPrisma, creds)
    expect(reused.email).toBe('a@b.c')
    expect(reused.username).toBe('alice')
  })
})
```

- [ ] **Step 11.2: Run — expect FAIL**

- [ ] **Step 11.3: Add to `src/services/auth.js`**

```js
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
        passwordHash: '!',
      },
    })
    // Purge all session rows for this user
    await tx.$executeRaw`DELETE FROM user_sessions WHERE sess->>'userId' = ${userId}`
  })
}
```

- [ ] **Step 11.4: Run — expect PASS**

- [ ] **Step 11.5: Commit**

```bash
git add src/services/auth.js src/__tests__/services/auth.deleteAccount.test.js
git commit -m "feat(auth): soft-delete account with cascade + tombstone"
```

---

## Task 12: Update session config in `src/index.js` + middleware deletedAt check

**Files:**
- Modify: `src/index.js`
- Modify: `src/middleware/auth.js`

- [ ] **Step 12.1: Update `src/index.js` session middleware**

Replace the existing `session({...})` block with:
```js
const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: 'user_sessions',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  rolling: true,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
})
```

- [ ] **Step 12.2: Update `src/middleware/auth.js`**

Replace with:
```js
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

export function requireSocketAuth(socket, next) {
  const userId = socket.request.session?.userId
  if (!userId) return next(new Error('Not authenticated'))
  socket.userId = userId
  next()
}
```

*Note:* Actual `deletedAt` enforcement happens in services (each service checks `deletedAt: null`) — middleware stays simple. Sessions for deleted users are always purged during `deleteAccount`, so a stale session-id hitting the server becomes a 401 naturally.

- [ ] **Step 12.3: Commit**

```bash
git add src/index.js src/middleware/auth.js
git commit -m "feat(auth): rolling:true sliding TTL + cookie options"
```

---

## Task 13: Rewrite `src/routes/auth.js` as thin adapters

**Files:**
- Rewrite: `src/routes/auth.js`

- [ ] **Step 13.1: Replace `src/routes/auth.js`**

```js
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as authService from '../services/auth.js'

const router = Router()

const PERSISTENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function errorStatus(code) {
  switch (code) {
    case 'INVALID_EMAIL':
    case 'INVALID_USERNAME':
    case 'INVALID_PASSWORD':
    case 'INVALID_INPUT':
    case 'PASSWORD_MISMATCH':
    case 'INVALID_TOKEN':
      return 400
    case 'INVALID_CREDENTIALS':
      return 401
    case 'EMAIL_TAKEN':
    case 'USERNAME_TAKEN':
      return 409
    case 'NOT_FOUND':
      return 404
    default:
      return 500
  }
}

function sendError(res, err, next) {
  if (err?.code && err.message) return res.status(errorStatus(err.code)).json({ error: err.message, code: err.code })
  return next(err)
}

function setSession(req, user, persistent) {
  req.session.userId = user.id
  req.session.userAgent = req.headers['user-agent'] || 'Unknown'
  req.session.ip = req.ip
  req.session.createdAt = new Date().toISOString()
  if (persistent) req.session.cookie.maxAge = PERSISTENT_MAX_AGE_MS
}

router.post('/register', async (req, res, next) => {
  try {
    const user = await authService.register(req.app.locals.prisma, req.body)
    setSession(req, user, false)
    res.status(201).json({ user })
  } catch (err) { sendError(res, err, next) }
})

router.post('/login', async (req, res, next) => {
  try {
    const user = await authService.login(req.app.locals.prisma, req.body)
    setSession(req, user, Boolean(req.body?.persistent))
    res.json({ user })
  } catch (err) { sendError(res, err, next) }
})

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const user = await prisma.user.findFirst({
      where: { id: req.session.userId, deletedAt: null },
      select: { id: true, email: true, username: true },
    })
    if (!user) {
      return req.session.destroy(() => res.status(401).json({ error: 'Session expired' }))
    }
    res.json({ user })
  } catch (err) { next(err) }
})

router.post('/forgot-password', async (req, res, next) => {
  try {
    await authService.requestPasswordReset(req.app.locals.prisma, req.body)
    res.json({ ok: true })
  } catch (err) {
    if (err?.code === 'INVALID_EMAIL') return res.status(400).json({ error: err.message, code: err.code })
    next(err)
  }
})

router.post('/reset-password', async (req, res, next) => {
  try {
    await authService.resetPassword(req.app.locals.prisma, req.body)
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    await authService.changePassword(req.app.locals.prisma, {
      userId: req.session.userId,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      currentSid: req.sessionID,
    })
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await authService.listSessions(req.app.locals.prisma, {
      userId: req.session.userId,
      currentSid: req.sessionID,
    })
    res.json({ sessions })
  } catch (err) { next(err) }
})

router.delete('/sessions/:sid', requireAuth, async (req, res, next) => {
  try {
    const isCurrent = req.params.sid === req.sessionID
    await authService.revokeSession(req.app.locals.prisma, {
      userId: req.session.userId, sid: req.params.sid,
    })
    if (isCurrent) {
      return req.session.destroy(() => {
        res.clearCookie('connect.sid')
        res.json({ ok: true })
      })
    }
    res.json({ ok: true })
  } catch (err) { sendError(res, err, next) }
})

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    await authService.deleteAccount(req.app.locals.prisma, { userId: req.session.userId })
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ ok: true })
    })
  } catch (err) { sendError(res, err, next) }
})

export default router
```

- [ ] **Step 13.2: Smoke test — routes test harness starts cleanly**

```bash
npm run test:run -- harness
```

Expected: PASS (harness tests still green; routes compile).

- [ ] **Step 13.3: Commit**

```bash
git add src/routes/auth.js
git commit -m "feat(auth): rewrite routes as thin adapters over services"
```

---

## Task 14: Route integration tests (supertest + cookies + sliding TTL)

**Files:**
- Create: `src/__tests__/routes/auth.integration.test.js`

- [ ] **Step 14.1: Write failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testPrisma, resetDb } from '../helpers/db.js'
import { buildTestApp } from '../helpers/app.js'
import { setTransport } from '../../utils/mailer.js'

const REG = { email: 'a@b.c', username: 'alice', password: 'pw1234', confirmPassword: 'pw1234' }
let app, captured

beforeEach(async () => {
  await resetDb()
  captured = []
  setTransport({ sendMail: async (opts) => { captured.push(opts); return { messageId: 'x' } } })
  app = buildTestApp()
})

function parseCookies(res) { return res.headers['set-cookie'] || [] }
function maxAgeOf(cookies) {
  const sid = cookies.find((c) => c.startsWith('connect.sid='))
  const m = sid?.match(/Max-Age=(\d+)/i)
  return m ? Number(m[1]) : null
}

describe('POST /api/auth/register', () => {
  it('creates user + sets session cookie without Max-Age (non-persistent)', async () => {
    const res = await request(app).post('/api/auth/register').send(REG)
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ email: 'a@b.c', username: 'alice' })
    expect(maxAgeOf(parseCookies(res))).toBeNull()
  })

  it('409 on duplicate email', async () => {
    await request(app).post('/api/auth/register').send(REG)
    const res = await request(app).post('/api/auth/register').send({ ...REG, username: 'other' })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => { await request(app).post('/api/auth/register').send(REG) })

  it('persistent:true sets Max-Age ~30d', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/logout')
    const res = await agent.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234', persistent: true })
    expect(res.status).toBe(200)
    const ma = maxAgeOf(parseCookies(res))
    expect(ma).toBeGreaterThan(29 * 24 * 60 * 60)
    expect(ma).toBeLessThanOrEqual(30 * 24 * 60 * 60)
  })

  it('persistent:false omits Max-Age', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/logout')
    const res = await agent.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234', persistent: false })
    expect(maxAgeOf(parseCookies(res))).toBeNull()
  })

  it('generic 401 on wrong password and unknown email (same shape)', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'WRONG' })
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@x.y', password: 'anything' })
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(a.body.error).toBe(b.body.error)
  })
})

describe('sliding TTL (rolling:true)', () => {
  it('persistent session cookie Max-Age refreshes on each authed request', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send(REG)
    await agent.post('/api/auth/logout')
    const login = await agent.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234', persistent: true })
    const ma1 = maxAgeOf(parseCookies(login))
    await new Promise((r) => setTimeout(r, 1100))
    const hit = await agent.get('/api/auth/me')
    const ma2 = maxAgeOf(parseCookies(hit))
    expect(ma1).not.toBeNull()
    expect(ma2).not.toBeNull()
    // Both are "30d" but expire computed fresh each time
    expect(Math.abs(ma2 - ma1)).toBeLessThan(10)
  })

  it('non-persistent session emits no Max-Age on authed request', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send(REG)
    const hit = await agent.get('/api/auth/me')
    expect(maxAgeOf(parseCookies(hit))).toBeNull()
  })
})

describe('POST /api/auth/logout', () => {
  it('destroys current session but leaves other devices signed in', async () => {
    const a = request.agent(app)
    const b = request.agent(app)
    await a.post('/api/auth/register').send(REG)
    await b.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })
    const preA = await a.get('/api/auth/me'); expect(preA.status).toBe(200)
    const preB = await b.get('/api/auth/me'); expect(preB.status).toBe(200)
    await a.post('/api/auth/logout')
    const postA = await a.get('/api/auth/me'); expect(postA.status).toBe(401)
    const postB = await b.get('/api/auth/me'); expect(postB.status).toBe(200)
  })
})

describe('forgot + reset password end-to-end', () => {
  it('happy path: email captured, link works, other sessions dropped', async () => {
    const a = request.agent(app)
    await a.post('/api/auth/register').send(REG)
    await a.post('/api/auth/logout')
    const b = request.agent(app)
    await b.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })

    await request(app).post('/api/auth/forgot-password').send({ email: 'a@b.c' }).expect(200)
    expect(captured).toHaveLength(1)
    const token = captured[0].text.match(/token=([0-9a-f]{64})/)[1]

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'newpass1' })
    expect(reset.status).toBe(200)

    // Agent b's session should now be invalidated
    const after = await b.get('/api/auth/me'); expect(after.status).toBe(401)

    const ok = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'newpass1' })
    expect(ok.status).toBe(200)
  })

  it('generic 200 for unknown email + no email sent', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@x.y' })
    expect(res.status).toBe(200)
    expect(captured).toHaveLength(0)
  })
})

describe('POST /api/auth/change-password', () => {
  it('kills other sessions, keeps current', async () => {
    const a = request.agent(app)
    const b = request.agent(app)
    await a.post('/api/auth/register').send(REG)
    await b.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })
    const change = await a.post('/api/auth/change-password').send({ currentPassword: 'pw1234', newPassword: 'newpass1' })
    expect(change.status).toBe(200)
    expect((await a.get('/api/auth/me')).status).toBe(200)
    expect((await b.get('/api/auth/me')).status).toBe(401)
  })
})

describe('sessions list + revoke', () => {
  it('lists own sessions; revoke current logs out; 404 on foreign sid', async () => {
    const a = request.agent(app)
    const b = request.agent(app)
    await a.post('/api/auth/register').send(REG)
    await b.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })

    const list = await a.get('/api/auth/sessions'); expect(list.status).toBe(200)
    const sessions = list.body.sessions
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    const current = sessions.find(s => s.isCurrent)
    const other = sessions.find(s => !s.isCurrent)

    // Revoke other (b's) session
    const rev = await a.delete(`/api/auth/sessions/${other.sid}`); expect(rev.status).toBe(200)
    expect((await b.get('/api/auth/me')).status).toBe(401)

    // Revoke a random sid → 404
    const nf = await a.delete('/api/auth/sessions/does-not-exist'); expect(nf.status).toBe(404)

    // Revoke own current session → logs out
    const self = await a.delete(`/api/auth/sessions/${current.sid}`); expect(self.status).toBe(200)
    expect((await a.get('/api/auth/me')).status).toBe(401)
  })
})

describe('DELETE /api/auth/account', () => {
  it('soft-deletes user; original email becomes reusable', async () => {
    const a = request.agent(app)
    await a.post('/api/auth/register').send(REG)
    const del = await a.delete('/api/auth/account'); expect(del.status).toBe(200)
    const login = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })
    expect(login.status).toBe(401)
    const reReg = await request(app).post('/api/auth/register').send(REG)
    expect(reReg.status).toBe(201)
  })
})

describe('cross-cutting', () => {
  it('protected routes 401 without a session', async () => {
    for (const path of ['/api/auth/me', '/api/auth/logout', '/api/auth/change-password', '/api/auth/sessions', '/api/auth/account']) {
      const method = path.endsWith('/account') ? 'delete' : path.includes('change-password') ? 'post' : path === '/api/auth/logout' ? 'post' : 'get'
      const res = await request(app)[method](path).send({})
      expect(res.status, `for ${method.toUpperCase()} ${path}`).toBe(401)
    }
  })
})
```

- [ ] **Step 14.2: Run — expect most PASS; the sliding-TTL test may need a tolerance tweak**

```bash
npm run test:run -- routes/auth.integration
```

- [ ] **Step 14.3: Adjust sliding-TTL tolerance if needed (local clock granularity)**

If `ma1` and `ma2` differ by >10 sec on slow CI, widen the tolerance to `60`.

- [ ] **Step 14.4: Commit**

```bash
git add src/__tests__/routes/auth.integration.test.js
git commit -m "test(auth): route integration covering TTL, reset flow, sessions, deletion"
```

---

## Task 15: docker-compose — add Mailhog + wire SMTP env

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 15.1: Modify `docker-compose.yml`**

Add to `app.environment`:
```yaml
      SMTP_HOST: mailhog
      SMTP_PORT: 1025
      SMTP_FROM: noreply@webchat.local
      APP_URL: http://localhost:3000
```

Add third service at root `services`:
```yaml
  mailhog:
    image: mailhog/mailhog
    ports:
      - "8025:8025"   # Web UI
    restart: unless-stopped
```

- [ ] **Step 15.2: Validate compose file**

```bash
docker compose config > /dev/null
```

Expected: no errors.

- [ ] **Step 15.3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(auth): add mailhog service + SMTP env"
```

---

## Task 16: Frontend — Vue 3 auth pages

**Files:**
- Rewrite: `public/index.html`
- Rewrite: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 16.1: Rewrite `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Webchat</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 16.2: Rewrite `public/app.js`**

```js
const { createApp, ref, computed, onMounted } = Vue

const api = async (method, path, body) => {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, code: data.code })
  return data
}

const parsePath = () => {
  const url = new URL(location.href)
  return { path: url.pathname, token: url.searchParams.get('token') }
}

createApp({
  setup() {
    const route = ref(parsePath())
    window.addEventListener('popstate', () => { route.value = parsePath() })
    const go = (p) => { history.pushState({}, '', p); route.value = parsePath() }

    const me = ref(null)
    const loadMe = async () => { try { me.value = (await api('GET', '/api/auth/me')).user } catch { me.value = null } }
    onMounted(loadMe)

    // shared flash
    const flash = ref('')
    const setFlash = (m) => { flash.value = m; setTimeout(() => flash.value = '', 4000) }

    // form states
    const regForm = ref({ email: '', username: '', password: '', confirmPassword: '' })
    const loginForm = ref({ email: '', password: '', persistent: false })
    const forgotForm = ref({ email: '' })
    const resetForm = ref({ newPassword: '', confirm: '' })
    const changeForm = ref({ currentPassword: '', newPassword: '' })
    const sessions = ref([])

    const doRegister = async () => {
      try { me.value = (await api('POST', '/api/auth/register', regForm.value)).user; go('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogin = async () => {
      try { me.value = (await api('POST', '/api/auth/login', loginForm.value)).user; go('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogout = async () => { await api('POST', '/api/auth/logout'); me.value = null; go('/login') }
    const doForgot = async () => {
      try { await api('POST', '/api/auth/forgot-password', forgotForm.value); setFlash('If that email exists, a reset link has been sent.') }
      catch (e) { setFlash(e.message) }
    }
    const doReset = async () => {
      if (resetForm.value.newPassword !== resetForm.value.confirm) return setFlash('Passwords do not match')
      try { await api('POST', '/api/auth/reset-password', { token: route.value.token, newPassword: resetForm.value.newPassword }); setFlash('Password reset. Please sign in.'); go('/login') }
      catch (e) { setFlash(e.message) }
    }
    const doChange = async () => {
      try { await api('POST', '/api/auth/change-password', changeForm.value); setFlash('Password changed. Other sessions were signed out.'); changeForm.value = { currentPassword: '', newPassword: '' }; await loadSessions() }
      catch (e) { setFlash(e.message) }
    }
    const loadSessions = async () => { sessions.value = (await api('GET', '/api/auth/sessions')).sessions }
    const revoke = async (sid) => {
      await api('DELETE', `/api/auth/sessions/${sid}`)
      const s = sessions.value.find(s => s.sid === sid)
      if (s?.isCurrent) { me.value = null; go('/login') } else { await loadSessions() }
    }
    const doDelete = async () => {
      if (!confirm('Delete your account? Your owned rooms and their messages will be permanently erased. This cannot be undone.')) return
      await api('DELETE', '/api/auth/account'); me.value = null; go('/login')
    }

    const view = computed(() => {
      const p = route.value.path
      if (p === '/register') return 'register'
      if (p === '/forgot') return 'forgot'
      if (p === '/reset') return 'reset'
      if (p === '/profile') return me.value ? 'profile' : 'login'
      return me.value ? 'profile' : 'login'
    })

    // load sessions when entering profile
    const v = computed(() => view.value)
    v.effect = null
    Vue.watch(v, (nv) => { if (nv === 'profile') loadSessions() })

    return { view, me, flash, regForm, loginForm, forgotForm, resetForm, changeForm, sessions,
      doRegister, doLogin, doLogout, doForgot, doReset, doChange, revoke, doDelete, go }
  },
  template: `
    <div class="auth-wrap">
      <div v-if="flash" class="flash">{{ flash }}</div>

      <section v-if="view==='login'" class="card">
        <h1>Sign in</h1>
        <form @submit.prevent="doLogin">
          <label>Email <input v-model="loginForm.email" type="email" required></label>
          <label>Password <input v-model="loginForm.password" type="password" required></label>
          <label class="inline"><input v-model="loginForm.persistent" type="checkbox"> Keep me signed in</label>
          <button type="submit">Sign in</button>
        </form>
        <p><a href="#" @click.prevent="go('/register')">Create account</a> · <a href="#" @click.prevent="go('/forgot')">Forgot password?</a></p>
      </section>

      <section v-if="view==='register'" class="card">
        <h1>Register</h1>
        <form @submit.prevent="doRegister">
          <label>Email <input v-model="regForm.email" type="email" required></label>
          <label>Username <input v-model="regForm.username" required></label>
          <label>Password <input v-model="regForm.password" type="password" required></label>
          <label>Confirm password <input v-model="regForm.confirmPassword" type="password" required></label>
          <button type="submit">Register</button>
        </form>
        <p><a href="#" @click.prevent="go('/login')">Already have an account?</a></p>
      </section>

      <section v-if="view==='forgot'" class="card">
        <h1>Forgot password</h1>
        <form @submit.prevent="doForgot">
          <label>Email <input v-model="forgotForm.email" type="email" required></label>
          <button type="submit">Send reset link</button>
        </form>
        <p><a href="#" @click.prevent="go('/login')">Back to sign in</a></p>
      </section>

      <section v-if="view==='reset'" class="card">
        <h1>Set new password</h1>
        <form @submit.prevent="doReset">
          <label>New password <input v-model="resetForm.newPassword" type="password" required></label>
          <label>Confirm <input v-model="resetForm.confirm" type="password" required></label>
          <button type="submit">Reset password</button>
        </form>
      </section>

      <section v-if="view==='profile'" class="card">
        <h1>Profile</h1>
        <p>Signed in as <strong>{{ me?.username }}</strong> ({{ me?.email }})</p>
        <button @click="doLogout">Sign out</button>

        <h2>Change password</h2>
        <form @submit.prevent="doChange">
          <label>Current password <input v-model="changeForm.currentPassword" type="password" required></label>
          <label>New password <input v-model="changeForm.newPassword" type="password" required></label>
          <button type="submit">Change</button>
        </form>

        <h2>Active sessions</h2>
        <table class="sessions">
          <thead><tr><th>Created</th><th>User-Agent</th><th>IP</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in sessions" :key="s.sid">
              <td>{{ new Date(s.createdAt || s.expire).toLocaleString() }}</td>
              <td>{{ s.userAgent }}<span v-if="s.isCurrent"> (this device)</span></td>
              <td>{{ s.ip }}</td>
              <td><button @click="revoke(s.sid)">Revoke</button></td>
            </tr>
          </tbody>
        </table>

        <h2 class="danger">Danger zone</h2>
        <button class="danger" @click="doDelete">Delete account</button>
      </section>
    </div>
  `,
}).mount('#app')
```

- [ ] **Step 16.3: Append to `public/styles.css`**

```css
.auth-wrap { max-width: 480px; margin: 40px auto; font-family: system-ui, sans-serif; }
.card { padding: 24px; border: 1px solid #e4e4e7; border-radius: 12px; margin-bottom: 16px; }
.card h1 { margin-top: 0; }
.card form { display: flex; flex-direction: column; gap: 10px; }
.card label { display: flex; flex-direction: column; font-size: 14px; color: #52525b; gap: 4px; }
.card label.inline { flex-direction: row; align-items: center; }
.card input[type=email], .card input[type=password], .card input[type=text] {
  padding: 8px 10px; border: 1px solid #d4d4d8; border-radius: 6px; font-size: 14px;
}
.card button { padding: 8px 14px; border: 0; border-radius: 6px; background: #2563eb; color: white; cursor: pointer; }
.card button.danger, h2.danger { color: #b91c1c; }
.card button.danger { background: transparent; border: 1px solid #b91c1c; }
.flash { padding: 10px 12px; border: 1px solid #fcd34d; background: #fef3c7; border-radius: 6px; margin-bottom: 10px; }
.sessions { width: 100%; border-collapse: collapse; font-size: 14px; }
.sessions th, .sessions td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #f4f4f5; }
```

- [ ] **Step 16.4: Smoke start the dev server manually (optional during TDD)**

```bash
docker compose up -d postgres mailhog
DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat npm run dev
# open http://localhost:3000
```

- [ ] **Step 16.5: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat(auth): Vue 3 frontend for register/login/forgot/reset/profile"
```

---

## Task 17: Final end-to-end verification

**Files:** none

- [ ] **Step 17.1: Fresh all-in-one run**

```bash
docker compose down -v
docker compose up --build -d
# wait for healthcheck
sleep 15
```

- [ ] **Step 17.2: Run migration against the live DB**

```bash
docker compose exec app npx prisma migrate deploy
```

- [ ] **Step 17.3: Run the full test suite (against localhost)**

```bash
npm run test:run
npm run lint
npm run typecheck
```

Expected: all green.

- [ ] **Step 17.4: Manual E2E smoke**

1. Open `http://localhost:3000` → redirects to `/login`.
2. Click **Create account** → register alice@x / alice / pw1234 → land on `/profile`.
3. Sign out → sign in with **Keep me signed in** checked → close tab → reopen → still signed in.
4. Open incognito window → sign in with alice → visit `/profile` on main window → session list shows 2 entries.
5. Revoke the incognito row → refresh incognito → kicked to login.
6. On `/forgot` enter alice@x → open `http://localhost:8025` (Mailhog UI) → find email → click reset link → set new password → redirected to `/login` → sign in with new password.
7. On `/profile` change password (with the new current → another new) → refresh another tab (if it was open) → kicked to login; current tab still signed in.
8. Delete account → confirmation modal → kicked to login; try logging back in with alice@x → fails.
9. Register again with alice@x / alice / pw1234 → succeeds.

- [ ] **Step 17.5: Final merge commit (if worktree)**

```bash
git log --oneline | head -n 20
```

No additional commit required if prior tasks committed cleanly.

---

## Self-Review (plan author's checklist — done)

**Spec coverage:**
- 3.1 Registration → Tasks 4, 6, 13, 14
- 3.2 Sign-in + Keep me signed in → Tasks 7, 12, 13, 14
- 3.3 Sign-out → Tasks 13, 14
- 3.4 Password reset → Tasks 3, 5, 8, 13, 14, 15
- 3.5 Password change → Tasks 9, 13, 14
- 3.6 Session management → Tasks 10, 13, 14
- 3.7 Account deletion → Tasks 2, 11, 13, 14
- Sliding TTL (Section 13 NFR) → Tasks 12, 14
- Mailhog infra → Task 15

**Placeholder scan:** No TBDs, no "add appropriate …", no "similar to task N" without code. Every code step has full snippets.

**Type / naming consistency:** `AuthError`, `AuthError.code` strings (`INVALID_*`, `EMAIL_TAKEN`, `USERNAME_TAKEN`, `INVALID_CREDENTIALS`, `INVALID_TOKEN`, `PASSWORD_MISMATCH`, `NOT_FOUND`) used consistently across services and the route `errorStatus` map. `currentSid` parameter name matches between `changePassword` signature and the route call-site. Service export list: `register`, `login`, `requestPasswordReset`, `resetPassword`, `changePassword`, `listSessions`, `revokeSession`, `deleteAccount`, `AuthError` — all imported in routes/tests with matching names.

---

## Post-Plan Actions (after ExitPlanMode approval)

1. Copy this plan to `docs/superpowers/plans/2026-04-20-auth-sessions.md` (the canonical writing-plans location).
2. Commit with `docs: auth & sessions implementation plan`.
3. Offer execution choice (subagent-driven vs inline) per the writing-plans skill handoff.
