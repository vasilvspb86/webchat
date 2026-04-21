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
