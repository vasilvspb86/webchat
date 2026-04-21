const { createApp, ref, computed, onMounted } = Vue

export const api = async (method, path, body) => {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, code: data.code })
  return data
}

// ── Socket.io singleton ──
let _socket = null
const _handlers = new Map()
export const useSocket = () => {
  if (!_socket && typeof io === 'function') {
    _socket = io({ withCredentials: true })
    _socket.onAny((event, payload) => {
      const set = _handlers.get(event)
      if (set) for (const fn of set) { try { fn(payload) } catch (e) { console.error('[socket]', event, e) } }
    })
  }
  return {
    on(event, handler) {
      if (!_handlers.has(event)) _handlers.set(event, new Set())
      _handlers.get(event).add(handler)
      return () => _handlers.get(event)?.delete(handler)
    },
    joinRoom(/* roomId */) { /* owned by messaging sub-project; broadcasts arrive anyway */ },
    get raw() { return _socket },
  }
}

// ── Routing (pathname + hash) ──
const parsePath = () => {
  const url = new URL(location.href)
  const hash = (url.hash || '').replace(/^#/, '')
  return { path: url.pathname, hash, token: url.searchParams.get('token') }
}
export const go = (p) => {
  if (p.startsWith('#')) { location.hash = p.slice(1); return }
  history.pushState({}, '', p)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export const app = createApp({
  setup() {
    const route = ref(parsePath())
    const refreshRoute = () => { route.value = parsePath() }
    window.addEventListener('popstate', refreshRoute)
    window.addEventListener('hashchange', refreshRoute)
    const navigate = (p) => {
      if (p.startsWith('#')) { location.hash = p.slice(1); return }
      history.pushState({}, '', p); refreshRoute()
    }

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
      try { me.value = (await api('POST', '/api/auth/register', regForm.value)).user; navigate('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogin = async () => {
      try { me.value = (await api('POST', '/api/auth/login', loginForm.value)).user; navigate('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogout = async () => {
      try { await api('POST', '/api/auth/logout'); me.value = null; navigate('/login') }
      catch (e) { setFlash(e.message) }
    }
    const doForgot = async () => {
      try { await api('POST', '/api/auth/forgot-password', forgotForm.value); setFlash('If that email exists, a reset link has been sent.') }
      catch (e) { setFlash(e.message) }
    }
    const doReset = async () => {
      if (resetForm.value.newPassword !== resetForm.value.confirm) return setFlash('Passwords do not match')
      try { await api('POST', '/api/auth/reset-password', { token: route.value.token, newPassword: resetForm.value.newPassword }); setFlash('Password reset. Please sign in.'); navigate('/login') }
      catch (e) { setFlash(e.message) }
    }
    const doChange = async () => {
      try { await api('POST', '/api/auth/change-password', changeForm.value); setFlash('Password changed. Other sessions were signed out.'); changeForm.value = { currentPassword: '', newPassword: '' }; await loadSessions() }
      catch (e) { setFlash(e.message) }
    }
    const loadSessions = async () => { sessions.value = (await api('GET', '/api/auth/sessions')).sessions }
    const revoke = async (sid) => {
      try {
        await api('DELETE', `/api/auth/sessions/${sid}`)
        const s = sessions.value.find(s => s.sid === sid)
        if (s?.isCurrent) { me.value = null; navigate('/login') } else { await loadSessions() }
      } catch (e) { setFlash(e.message) }
    }
    const doDelete = async () => {
      if (!confirm('Delete your account? Your owned rooms and their messages will be permanently erased. This cannot be undone.')) return
      try { await api('DELETE', '/api/auth/account'); me.value = null; navigate('/login') }
      catch (e) { setFlash(e.message) }
    }

    const view = computed(() => {
      const p = route.value.path
      const h = route.value.hash
      if (p === '/register') return 'register'
      if (p === '/forgot') return 'forgot'
      if (p === '/reset') return 'reset'
      if (!me.value) return 'login'
      if (h.startsWith('/rooms/new')) return 'rooms-new'
      if (h.startsWith('/rooms/')) return 'rooms-page'
      if (h === '/rooms') return 'rooms-catalog'
      if (h === '/invitations') return 'invitations'
      if (p === '/profile') return 'profile'
      return 'profile'
    })

    const currentRoomId = computed(() => {
      const m = route.value.hash.match(/^\/rooms\/([^/]+)$/)
      return m && m[1] !== 'new' ? m[1] : null
    })

    // load sessions when entering profile
    const v = computed(() => view.value)
    v.effect = null
    Vue.watch(v, (nv) => { if (nv === 'profile') loadSessions() })

    return { view, me, flash, regForm, loginForm, forgotForm, resetForm, changeForm, sessions,
      currentRoomId,
      doRegister, doLogin, doLogout, doForgot, doReset, doChange, revoke, doDelete, go: navigate }
  },
  template: `
    <div :class="['ep-app-root', view.startsWith('rooms-') || view==='invitations' ? 'is-rooms' : 'is-auth']">
      <div v-if="flash" class="flash" role="status" aria-live="polite">{{ flash }}</div>

      <!-- Rooms sub-project views (components registered by Task 15-19 subagents) -->
      <room-catalog v-if="view==='rooms-catalog' || view==='rooms-new'" :show-create="view==='rooms-new'" @navigate="go"></room-catalog>
      <room-page v-else-if="view==='rooms-page'" :room-id="currentRoomId" @navigate="go"></room-page>
      <invitation-inbox v-else-if="view==='invitations'" @navigate="go"></invitation-inbox>

      <div v-else class="auth-wrap">

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

        <h2>Navigation</h2>
        <p>
          <a href="#/rooms" @click.prevent="go('#/rooms')">Browse rooms</a> ·
          <a href="#/invitations" @click.prevent="go('#/invitations')">Invitations</a>
        </p>
      </section>

      </div>
    </div>
  `,
})

// Defer mount so component modules (RoomCatalog, RoomPage, etc.) can
// register themselves via app.component(...) before the first render.
queueMicrotask(() => app.mount('#app'))
