import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import session from 'express-session'
import request from 'supertest'
import { buildSessionMiddleware } from '../../sessionMiddleware.js'

// Reproduces the `docker compose up` scenario QA hit on http://localhost:3000:
// NODE_ENV=production + trust proxy + plain HTTP (no X-Forwarded-Proto).
// express-session must still emit Set-Cookie or the browser has nothing to
// send back and every authed request 401s. Uses an in-memory store so this
// runs without Postgres.
function buildProdLikeApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use(buildSessionMiddleware({
    secret: 'test-secret',
    store: new session.MemoryStore(),
  }))
  app.post('/api/_login', (req, res) => {
    req.session.userId = 'user-123'
    res.json({ ok: true })
  })
  app.get('/api/_me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' })
    res.json({ userId: req.session.userId })
  })
  return app
}

describe('session cookie over plain HTTP (NODE_ENV=production)', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
  })
  afterEach(() => { process.env.NODE_ENV = originalEnv })

  it('login response sets connect.sid Set-Cookie even without HTTPS', async () => {
    const res = await request(buildProdLikeApp()).post('/api/_login').send({})
    expect(res.status).toBe(200)
    const cookies = res.headers['set-cookie'] || []
    expect(cookies.some((c) => c.startsWith('connect.sid='))).toBe(true)
  })

  it('a subsequent request carries the cookie and stays authenticated', async () => {
    const agent = request.agent(buildProdLikeApp())
    const login = await agent.post('/api/_login').send({})
    expect(login.status).toBe(200)
    const me = await agent.get('/api/_me')
    expect(me.status).toBe(200)
    expect(me.body.userId).toBe('user-123')
  })
})
