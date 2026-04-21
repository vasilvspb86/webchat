// Task 18 — Invitations tab. Private rooms only: invite by username.
import { app, api } from '/app.js'
const { ref, computed, watch } = Vue

// The invite endpoint expects { userId }, so we resolve the username via
// /api/users/search first. Pending invitations list has no server endpoint
// exposed yet → show a placeholder beneath the invite input.

app.component('invitations-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
    room:   { type: Object, default: null },
  },
  emits: ['count'],
  setup(props, { emit }) {
    const username = ref('')
    const submitting = ref(false)
    const error = ref('')
    const success = ref('')

    const isPublic = computed(() => props.room?.isPublic === true)

    const mapInviteError = (e) => {
      const status = e?.status
      const code = e?.code
      if (status === 404) return 'User not found.'
      if (code === 'WRONG_VISIBILITY') return "Public rooms don't take invitations."
      if (code === 'CANNOT_INVITE_SELF') return "You can't invite yourself."
      if (code === 'ALREADY_MEMBER') return "They're already in."
      if (code === 'ALREADY_BANNED') return 'That user is banned from this room.'
      if (code === 'PENDING_INVITE') return 'An invitation is already pending.'
      if (code === 'FORBIDDEN') return "You don't have permission to invite here."
      return e?.message || 'Failed to send invitation.'
    }

    const resolveUserId = async (raw) => {
      const q = raw.trim().replace(/^@/, '')
      if (!q) return null
      try {
        const data = await api('GET', `/api/users/search?q=${encodeURIComponent(q)}`)
        const users = data?.users || []
        // Exact match first (case-insensitive), else null
        const exact = users.find((u) => u.username.toLowerCase() === q.toLowerCase())
        return exact ? exact.id : null
      } catch { return null }
    }

    const submit = async () => {
      if (submitting.value) return
      error.value = ''; success.value = ''
      const raw = username.value.trim().replace(/^@/, '')
      if (!raw) { error.value = 'Enter a username.'; return }
      if (isPublic.value) { error.value = "Public rooms don't take invitations."; return }

      submitting.value = true
      try {
        const userId = await resolveUserId(raw)
        if (!userId) { error.value = 'User not found.'; return }
        await api('POST', `/api/rooms/${props.roomId}/invitations`, { userId })
        success.value = `Invitation sent to @${raw}.`
        username.value = ''
      } catch (e) {
        error.value = mapInviteError(e)
      } finally {
        submitting.value = false
      }
    }

    // No pending-invitations list endpoint exists; report zero so the tab header
    // does not show a stale count from a prior (wrongly-counted) fetch.
    emit('count', 0)

    watch(success, (v) => { if (v) setTimeout(() => { if (success.value === v) success.value = '' }, 3000) })

    return { username, submitting, error, success, isPublic, submit }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Invitations">
      <div class="admin-pane__bar">
        <span class="ep-muted ep-body">Invite someone by username. Private rooms only.</span>
      </div>

      <div v-if="isPublic" class="ep-body ep-muted">
        This room is public — anyone signed in can join. Switch to private in Settings to send invitations.
      </div>

      <form v-else class="admin-invite" autocomplete="off" @submit.prevent="submit"
            style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap;">
        <input
          v-model="username"
          type="search"
          placeholder="@username"
          :disabled="submitting"
          style="height:36px;padding:0 var(--space-4);background:var(--surface-sunken);border:var(--stroke-hair) solid var(--edge-quiet);border-radius:var(--radius-pill);color:var(--text-primary);font:inherit;font-size:var(--text-sm);outline:none;min-width:240px;"
        >
        <button type="submit" class="ep-btn ep-btn--primary ep-btn--sm" :disabled="submitting">
          {{ submitting ? 'Sending…' : 'Invite' }}
        </button>
      </form>

      <div v-if="error" class="ep-field__error" role="alert">{{ error }}</div>
      <div v-if="success" class="ep-eyebrow ep-eyebrow--info" role="status">{{ success }}</div>

      <p class="ep-body ep-muted" style="margin-top:var(--space-4);">
        Pending invitations list — wired up when endpoint is available.
      </p>
    </section>
  `,
})
