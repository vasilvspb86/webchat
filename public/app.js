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

    const doRegister = async (payload) => {
      const body = payload || regForm.value
      try { me.value = (await api('POST', '/api/auth/register', body)).user; navigate('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogin = async (payload) => {
      const body = payload || loginForm.value
      try { me.value = (await api('POST', '/api/auth/login', body)).user; navigate('/profile') }
      catch (e) { setFlash(e.message) }
    }
    const doLogout = async () => {
      try { await api('POST', '/api/auth/logout'); me.value = null; navigate('/login') }
      catch (e) { setFlash(e.message) }
    }
    const doForgot = async (payload) => {
      const body = payload || forgotForm.value
      try { await api('POST', '/api/auth/forgot-password', body); setFlash('If that email exists, a reset link has been sent.') }
      catch (e) { setFlash(e.message) }
    }
    const doReset = async (payload) => {
      const src = payload || resetForm.value
      if (src.newPassword !== src.confirm) return setFlash('Passwords do not match')
      try { await api('POST', '/api/auth/reset-password', { token: route.value.token, newPassword: src.newPassword }); setFlash('Password reset. Please sign in.'); navigate('/login') }
      catch (e) { setFlash(e.message) }
    }
    const doChange = async (payload) => {
      const body = payload || changeForm.value
      try { await api('POST', '/api/auth/change-password', body); setFlash('Password changed. Other sessions were signed out.'); changeForm.value = { currentPassword: '', newPassword: '' }; await loadSessions() }
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
      if (h === '/rooms/mine') return 'my-rooms'
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
    <div :class="['ep-app-root', view.startsWith('rooms-') || view==='my-rooms' || view==='invitations' || view==='profile' ? 'is-rooms' : 'is-auth']">
      <!-- Rooms sub-project views -->
      <room-catalog v-if="view==='rooms-catalog' || view==='rooms-new'" :show-create="view==='rooms-new'" @navigate="go"></room-catalog>
      <my-rooms-page v-else-if="view==='my-rooms'" :me="me" @navigate="go"></my-rooms-page>
      <room-page v-else-if="view==='rooms-page'" :room-id="currentRoomId" @navigate="go"></room-page>
      <invitation-inbox v-else-if="view==='invitations'" @navigate="go"></invitation-inbox>

      <!-- Profile -->
      <profile-page v-else-if="view==='profile'"
        :me="me" :sessions="sessions" :flash="flash"
        @change-password="doChange"
        @revoke="revoke"
        @sign-out="doLogout"
        @delete-account="doDelete"
        @navigate="go"></profile-page>

      <!-- Auth views (Ember & Pitch skin) -->
      <login-page v-else-if="view==='login'" :flash="flash" @submit="doLogin" @navigate="go"></login-page>
      <register-page v-else-if="view==='register'" :flash="flash" @submit="doRegister" @navigate="go"></register-page>
      <forgot-password-page v-else-if="view==='forgot'" :flash="flash" @submit="doForgot" @navigate="go"></forgot-password-page>
      <reset-password-page v-else-if="view==='reset'" :flash="flash" @submit="doReset" @navigate="go"></reset-password-page>
    </div>
  `,
})

// Defer mount so component modules (RoomCatalog, RoomPage, etc.) can
// register themselves via app.component(...) before the first render.
queueMicrotask(() => app.mount('#app'))
