// Task 18 — Banned tab. Lists banned users + unban action.
import { app, api, useSocket } from '/app.js'
const { ref, onMounted, onUnmounted, watch } = Vue

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

app.component('banned-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
  },
  emits: ['count'],
  setup(props, { emit }) {
    const bans = ref([])
    const pending = ref(new Set())
    const error = ref(null)
    const flash = ref('')
    const socket = useSocket()
    const unsubs = []

    const fetchBans = async () => {
      try {
        const data = await api('GET', `/api/rooms/${props.roomId}/bans`)
        bans.value = data.bans || []
        emit('count', bans.value.length)
      } catch (e) { error.value = e.message || 'Failed to load bans' }
    }

    const isPending = (uid) => pending.value.has(uid)
    const markPending = (uid, on) => {
      const next = new Set(pending.value); on ? next.add(uid) : next.delete(uid); pending.value = next
    }

    const unban = async (b) => {
      markPending(b.userId, true)
      try {
        await api('DELETE', `/api/rooms/${props.roomId}/bans/${b.userId}`)
        // Optimistic: remove from local list; socket also notifies
        bans.value = bans.value.filter((x) => x.userId !== b.userId)
        emit('count', bans.value.length)
      } catch (e) {
        if (e.status === 404) {
          flash.value = 'Already unbanned.'
          bans.value = bans.value.filter((x) => x.userId !== b.userId)
          emit('count', bans.value.length)
        } else {
          error.value = e.message || 'Failed to unban'
        }
      } finally { markPending(b.userId, false) }
    }

    onMounted(() => {
      fetchBans()
      unsubs.push(
        socket.on('member_banned', fetchBans),
        socket.on('member_unbanned', fetchBans),
      )
    })
    onUnmounted(() => { for (const u of unsubs) { try { u && u() } catch {} } })
    watch(error, (v) => { if (v) setTimeout(() => { if (error.value === v) error.value = null }, 4000) })
    watch(flash, (v) => { if (v) setTimeout(() => { if (flash.value === v) flash.value = '' }, 3000) })

    return { bans, error, flash, isPending, unban, tintFor, formatDate }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Banned">
      <div class="admin-pane__bar">
        <span class="ep-muted ep-body">Users who can't rejoin until lifted.</span>
      </div>

      <div v-if="flash" class="ep-eyebrow ep-eyebrow--info" role="status">{{ flash }}</div>
      <div v-if="error" class="ep-field__error" role="alert">{{ error }}</div>

      <ul class="admin-list" v-if="bans.length">
        <li v-for="b in bans" :key="b.userId" class="mr">
          <span class="ep-avatar ep-avatar--md" :data-tint="tintFor(b.userId)" aria-hidden="true">
            {{ (b.username ? b.username[0] : '?').toUpperCase() }}
          </span>
          <span class="mr__name">
            <strong>@{{ b.username || 'unknown' }}</strong>
            <span class="ep-mono">banned by @{{ b.bannedByUsername }} on {{ formatDate(b.bannedAt) }}</span>
          </span>
          <span class="ep-chip ep-chip--banned">Banned</span>
          <span></span>
          <div class="mr__actions">
            <button
              type="button"
              class="ep-btn ep-btn--ghost ep-btn--sm"
              :disabled="isPending(b.userId)"
              @click="unban(b)"
            >Unban</button>
          </div>
        </li>
      </ul>

      <p v-else class="ep-body ep-muted">Nobody is banned from this room.</p>
    </section>
  `,
})
