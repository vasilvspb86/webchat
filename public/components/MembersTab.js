// Task 18 — Members tab. Lists all members, allows promote/demote/ban.
import { app, api, useSocket } from '/app.js'
const { ref, computed, onMounted, onUnmounted, watch } = Vue

const TINTS = ['ember', 'gold', 'moss', 'tide', 'rust']
const tintFor = (id) => {
  let h = 0; for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return TINTS[Math.abs(h) % TINTS.length]
}
const formatDate = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return '' }
}

app.component('members-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
    room:   { type: Object, default: null },
  },
  emits: ['count'],
  setup(props, { emit }) {
    const members = ref([])
    const me = ref(null)
    const query = ref('')
    const pending = ref(new Set())  // userIds currently mid-action
    const error = ref(null)
    const socket = useSocket()
    const unsubs = []

    const fetchMembers = async () => {
      try {
        const data = await api('GET', `/api/rooms/${props.roomId}/members`)
        members.value = data.members || []
        emit('count', members.value.length)
      } catch (e) { error.value = e.message || 'Failed to load members' }
    }
    const loadMe = async () => { try { me.value = (await api('GET', '/api/auth/me')).user } catch { me.value = null } }

    const filtered = computed(() => {
      const q = query.value.trim().toLowerCase().replace(/^@/, '')
      if (!q) return members.value
      return members.value.filter((m) => m.username.toLowerCase().startsWith(q))
    })

    const isSelf = (m) => me.value && m.userId === me.value.id
    const chipClass = (m) => m.isOwner ? 'ep-chip--owner' : (m.isAdmin ? 'ep-chip--admin' : 'ep-chip--member')
    const chipLabel = (m) => m.isOwner ? 'Owner' : (m.isAdmin ? 'Admin' : 'Member')
    const isPending = (uid) => pending.value.has(uid)
    const markPending = (uid, on) => {
      const next = new Set(pending.value); on ? next.add(uid) : next.delete(uid); pending.value = next
    }

    const run = async (uid, fn) => {
      markPending(uid, true)
      try { await fn() } catch (e) { error.value = e.message || 'Action failed' }
      finally { markPending(uid, false) }
    }
    const promote = (m) => run(m.userId, async () => {
      await api('POST', `/api/rooms/${props.roomId}/admins`, { userId: m.userId })
    })
    const demote = (m) => run(m.userId, async () => {
      await api('DELETE', `/api/rooms/${props.roomId}/admins/${m.userId}`)
    })
    const ban = (m) => run(m.userId, async () => {
      if (!confirm(`Ban @${m.username}? They won't be able to rejoin unless unbanned.`)) return
      await api('DELETE', `/api/rooms/${props.roomId}/members/${m.userId}`)
    })

    onMounted(() => {
      loadMe(); fetchMembers()
      unsubs.push(
        socket.on('member_joined', fetchMembers),
        socket.on('member_left', fetchMembers),
        socket.on('member_banned', fetchMembers),
        socket.on('admin_granted', fetchMembers),
        socket.on('admin_revoked', fetchMembers),
      )
    })
    onUnmounted(() => { for (const u of unsubs) { try { u && u() } catch {} } })

    // Clear transient error after 4s
    watch(error, (v) => { if (v) setTimeout(() => { if (error.value === v) error.value = null }, 4000) })

    return { members, filtered, query, me, error, isSelf, chipClass, chipLabel, tintFor, formatDate, isPending, promote, demote, ban }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Members">
      <div class="admin-pane__bar">
        <span class="ep-muted ep-body">Everyone currently in the room.</span>
        <input v-model="query" type="search" placeholder="Find a member…">
      </div>

      <div v-if="error" class="ep-field__error" role="alert">{{ error }}</div>

      <ul class="admin-list" v-if="filtered.length">
        <li v-for="m in filtered" :key="m.userId" class="mr">
          <span class="ep-avatar ep-avatar--md" :data-tint="tintFor(m.userId)" aria-hidden="true">
            {{ (m.username[0] || '?').toUpperCase() }}
          </span>
          <span class="mr__name">
            <strong>@{{ m.username }}<span v-if="isSelf(m)" class="ep-muted" style="font-weight:400;"> (you)</span></strong>
            <span class="ep-mono">joined {{ formatDate(m.joinedAt) }}</span>
          </span>
          <span class="ep-chip" :class="chipClass(m)">{{ chipLabel(m) }}</span>
          <span class="ep-presence-dot" data-presence="offline" aria-hidden="true"></span>
          <div class="mr__actions">
            <button
              v-if="m.isAdmin"
              type="button"
              class="ep-btn ep-btn--ghost ep-btn--sm"
              :disabled="m.isOwner || isPending(m.userId)"
              @click="demote(m)"
            >Demote</button>
            <button
              v-else
              type="button"
              class="ep-btn ep-btn--gold ep-btn--sm"
              :disabled="isSelf(m) || isPending(m.userId)"
              @click="promote(m)"
            >Promote</button>
            <button
              type="button"
              class="ep-btn ep-btn--danger ep-btn--sm"
              :disabled="m.isOwner || isSelf(m) || isPending(m.userId)"
              @click="ban(m)"
            >Ban</button>
          </div>
        </li>
      </ul>

      <p v-else class="ep-body ep-muted">No members match "{{ query }}".</p>
    </section>
  `,
})
