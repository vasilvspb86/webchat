import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { resetDb } from '../helpers/db.js'
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
// express-session serializes its cookie with `Expires=<GMT>` rather than `Max-Age=<seconds>`.
// Accept either form: return Max-Age directly, or derive seconds-from-now from Expires.
// Cookies with Expires in the past (deletion cookies from logout) are treated as null.
function maxAgeOf(cookies) {
  const sid = cookies.find((c) => c.startsWith('connect.sid='))
  if (!sid) return null
  const ma = sid.match(/Max-Age=(\d+)/i)
  if (ma) return Number(ma[1])
  const ex = sid.match(/Expires=([^;]+)/i)
  if (!ex) return null
  const secs = Math.round((Date.parse(ex[1]) - Date.now()) / 1000)
  return secs > 0 ? secs : null
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
    const a = request.agent(app).set('User-Agent', 'device-A')
    const b = request.agent(app).set('User-Agent', 'device-B')
    await a.post('/api/auth/register').send(REG)
    await b.post('/api/auth/login').send({ email: 'a@b.c', password: 'pw1234' })

    const list = await a.get('/api/auth/sessions').set('User-Agent', 'device-A'); expect(list.status).toBe(200)
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
