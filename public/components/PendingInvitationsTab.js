// Task 7.4 — Pending invitations tab. Lists active invite tokens; allows revoke.
import { app, api } from '/app.js'
const { ref, computed, onMounted } = Vue

const TINTS = ['ember', 'gold', 'moss', 'tide', 'rust']
const tintFor = (username) => {
  let h = 0
  for (let i = 0; i < (username || '').length; i++) h = (h + (username || '').charCodeAt(i)) | 0
  return TINTS[Math.abs(h) % TINTS.length]
}

const formatIssued = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const part = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${part} · ${d.getFullYear()}`
  } catch { return '' }
}

const msLeft = (iso) => new Date(iso).getTime() - Date.now()

const expiryState = (iso) => msLeft(iso) < 86_400_000 ? 'soon' : 'fresh'

const expiryLabel = (iso) => {
  const ms = msLeft(iso)
  if (ms < 3_600_000) return 'under 1h'
  if (ms < 86_400_000) return 'under 24h'
  return `${Math.ceil(ms / 86_400_000)} days left`
}

const expiryAria = (iso) => {
  const ms = msLeft(iso)
  if (ms < 3_600_000) return 'Expires in under 1 hour'
  if (ms < 86_400_000) return 'Expires in under 24 hours'
  return `Expires in ${Math.ceil(ms / 86_400_000)} days`
}

app.component('pending-invitations-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
    room:   { type: Object, default: null },
  },
  emits: ['count'],
  setup(props, { emit }) {
    const loading = ref(true)
    const error = ref('')
    const invitations = ref([])
    const revokingId = ref(null)

    const canRevoke = computed(() => props.role === 'owner' || props.role === 'admin')

    onMounted(async () => {
      try {
        const data = await api('GET', `/api/rooms/${props.roomId}/invitations`)
        invitations.value = data.invitations || []
        emit('count', invitations.value.length)
      } catch (e) {
        error.value = e?.message || 'Failed to load invitations.'
        emit('count', 0)
      } finally {
        loading.value = false
      }
    })

    const revoke = async (inv) => {
      if (!canRevoke.value) return
      revokingId.value = inv.notificationId
      try {
        await api('DELETE', `/api/rooms/${props.roomId}/invitations/${inv.notificationId}`)
        const idx = invitations.value.findIndex((i) => i.notificationId === inv.notificationId)
        if (idx !== -1) invitations.value.splice(idx, 1)
        emit('count', invitations.value.length)
      } catch (e) {
        error.value = e?.message || 'Failed to revoke invitation.'
      } finally {
        revokingId.value = null
      }
    }

    return {
      loading, error, invitations, revokingId,
      canRevoke,
      tintFor, formatIssued, expiryState, expiryLabel, expiryAria,
      revoke,
    }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Pending invitations">

      <div class="admin-pane__bar">
        <span class="ep-muted ep-body">Seven-day tokens. Revoke any that haven't been accepted — the link stops working immediately.</span>
      </div>

      <div v-if="loading" class="ep-muted ep-body">Loading invitations…</div>

      <div v-else-if="error" class="ep-field__error" role="alert">{{ error }}</div>

      <div v-else-if="invitations.length === 0" class="ep-muted ep-body">No pending invitations.</div>

      <ul v-else class="ep-invites" role="list">
        <li v-for="inv in invitations" :key="inv.notificationId" class="ep-invite-row">
          <span class="ep-avatar ep-avatar--md" :data-tint="tintFor(inv.invitedUsername)" aria-hidden="true">{{ (inv.invitedUsername || '?').charAt(0).toUpperCase() }}</span>
          <span class="ep-invite-row__name">
            <strong>@{{ inv.invitedUsername }}</strong>
            <span class="ep-mono">issued {{ formatIssued(inv.createdAt) }}</span>
          </span>
          <span class="ep-invite-expiry" :data-state="expiryState(inv.expiresAt)" :aria-label="expiryAria(inv.expiresAt)">
            <svg class="ep-invite-expiry__svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5"/>
              <path d="M6 3.5V6l1.6 1.6"/>
            </svg>
            <span>{{ expiryLabel(inv.expiresAt) }}</span>
            <span class="ep-invite-expiry__sender">· by @{{ inv.invitedByUsername }}</span>
          </span>
          <button type="button"
            class="ep-btn ep-btn--sm"
            :class="expiryState(inv.expiresAt) === 'soon' ? 'ep-btn--gold' : 'ep-btn--ghost'"
            :disabled="!canRevoke || revokingId === inv.notificationId"
            @click="revoke(inv)">
            {{ revokingId === inv.notificationId ? 'Revoking…' : 'Revoke' }}
          </button>
        </li>
      </ul>

    </section>
  `,
})
