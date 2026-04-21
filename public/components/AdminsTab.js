// Task 18 — Admins tab. Subset of members where isAdmin || isOwner. Only Revoke action.
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

app.component('admins-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
    room:   { type: Object, default: null },
  },
  emits: ['count'],
  setup(props, { emit }) {
    const members = ref([])
    const me = ref(null)
    const pending = ref(new Set())
    const error = ref(null)
    const socket = useSocket()
    const unsubs = []

    const fetchMembers = async () => {
      try {
        const data = await api('GET', `/api/rooms/${props.roomId}/members`)
        members.value = data.members || []
        // Count: owner + admins
        const count = members.value.filter((m) => m.isOwner || m.isAdmin).length
        emit('count', count)
      } catch (e) { error.value = e.message || 'Failed to load admins' }
    }
    const loadMe = async () => { try { me.value = (await api('GET', '/api/auth/me')).user } catch { me.value = null } }

    const admins = computed(() => members.value.filter((m) => m.isOwner || m.isAdmin))
    const isSelf = (m) => me.value && m.userId === me.value.id
    const isPending = (uid) => pending.value.has(uid)
    const markPending = (uid, on) => {
      const next = new Set(pending.value); on ? next.add(uid) : next.delete(uid); pending.value = next
    }

    const revoke = async (m) => {
      if (m.isOwner) return
      const confirmMsg = isSelf(m)
        ? 'Step down as admin? You will lose admin rights in this room.'
        : `Revoke admin from @${m.username}?`
      if (!confirm(confirmMsg)) return
      markPending(m.userId, true)
      try {
        await api('DELETE', `/api/rooms/${props.roomId}/admins/${m.userId}`)
      } catch (e) { error.value = e.message || 'Failed to revoke admin' }
      finally { markPending(m.userId, false) }
    }

    onMounted(() => {
      loadMe(); fetchMembers()
      unsubs.push(
        socket.on('admin_granted', fetchMembers),
        socket.on('admin_revoked', fetchMembers),
        socket.on('member_left', fetchMembers),
        socket.on('member_banned', fetchMembers),
      )
    })
    onUnmounted(() => { for (const u of unsubs) { try { u && u() } catch {} } })
    watch(error, (v) => { if (v) setTimeout(() => { if (error.value === v) error.value = null }, 4000) })

    return { admins, me, error, isSelf, isPending, revoke, tintFor, formatDate }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Admins">
      <div class="admin-pane__bar">
        <span class="ep-muted ep-body">The owner and anyone promoted to admin.</span>
      </div>

      <div v-if="error" class="ep-field__error" role="alert">{{ error }}</div>

      <ul class="admin-list" v-if="admins.length">
        <li v-for="m in admins" :key="m.userId" class="mr">
          <span class="ep-avatar ep-avatar--md" :data-tint="tintFor(m.userId)" aria-hidden="true">
            {{ (m.username[0] || '?').toUpperCase() }}
          </span>
          <span class="mr__name">
            <strong>@{{ m.username }}<span v-if="isSelf(m)" class="ep-muted" style="font-weight:400;"> (you)</span></strong>
            <span class="ep-mono">joined {{ formatDate(m.joinedAt) }}</span>
          </span>
          <span class="ep-chip" :class="m.isOwner ? 'ep-chip--owner' : 'ep-chip--admin'">
            {{ m.isOwner ? 'Owner' : 'Admin' }}
          </span>
          <span class="ep-presence-dot" data-presence="offline" aria-hidden="true"></span>
          <div class="mr__actions">
            <button
              type="button"
              class="ep-btn ep-btn--ghost ep-btn--sm"
              :disabled="m.isOwner || isPending(m.userId)"
              @click="revoke(m)"
            >{{ isSelf(m) ? 'Step down' : 'Revoke' }}</button>
          </div>
        </li>
      </ul>

      <p v-else class="ep-body ep-muted">No admins yet.</p>
    </section>
  `,
})
