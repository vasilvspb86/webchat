// Task 19 — InvitationCard
// Renders one ROOM_INVITE notification with active / expiring / expired
// states computed client-side from expiresAt. Emits accept / decline.
import { app } from '/app.js'
const { computed } = Vue

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function formatRelative(deltaMs) {
  const abs = Math.abs(deltaMs)
  if (abs < HOUR) {
    const m = Math.max(1, Math.round(abs / (60 * 1000)))
    return `${m} minute${m === 1 ? '' : 's'}`
  }
  if (abs < DAY) {
    const h = Math.max(1, Math.round(abs / HOUR))
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const d = Math.max(1, Math.round(abs / DAY))
  return `${d} day${d === 1 ? '' : 's'}`
}

app.component('invitation-card', {
  props: {
    invitation: { type: Object, required: true },
  },
  emits: ['accept', 'decline'],
  setup(props, { emit }) {
    const expiresAtMs = computed(() => new Date(props.invitation.expiresAt).getTime())

    const state = computed(() => {
      const now = Date.now()
      const exp = expiresAtMs.value
      if (!Number.isFinite(exp) || exp <= now) return 'expired'
      if (exp - now <= DAY) return 'expiring'
      return 'active'
    })

    const timeLabel = computed(() => {
      const now = Date.now()
      const exp = expiresAtMs.value
      if (!Number.isFinite(exp)) return ''
      const delta = exp - now
      if (delta <= 0) return `closed ${formatRelative(delta)} ago`
      return `expires in ${formatRelative(delta)}`
    })

    const eyebrowLabel = computed(() => {
      if (state.value === 'expiring') return 'Expiring soon'
      if (state.value === 'expired') return 'Expired'
      return 'Invitation'
    })

    const acceptLabel = computed(() =>
      state.value === 'expiring' ? 'Accept before it closes' : 'Accept'
    )

    const metaLine = computed(() => {
      const inv = props.invitation
      const parts = []
      if (typeof inv.memberCount === 'number') {
        parts.push(`${inv.memberCount} ${inv.memberCount === 1 ? 'member' : 'members'}`)
      }
      parts.push(inv.isPublic === true ? 'public' : 'private')
      return parts.join(' · ')
    })

    const onDecline = () => { if (state.value !== 'expired') emit('decline', props.invitation.id) }
    const onAccept = () => { if (state.value !== 'expired') emit('accept', props.invitation.id) }

    return { state, timeLabel, eyebrowLabel, acceptLabel, metaLine, onDecline, onAccept }
  },
  template: `
    <article class="ep-inv-card" :data-state="state"
      :aria-label="'Invitation to ' + invitation.roomName">

      <div class="ep-inv-card__icon" aria-hidden="true">
        <svg v-if="state==='active'" width="22" height="22" viewBox="0 0 22 22"
          fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M2 5l9 7 9-7M2 5v12h18V5M2 5h18"/>
        </svg>
        <svg v-else-if="state==='expiring'" width="22" height="22" viewBox="0 0 22 22"
          fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="11" cy="11" r="8"/><path d="M11 6v5l3 2"/>
        </svg>
        <svg v-else width="22" height="22" viewBox="0 0 22 22"
          fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M4 4l14 14M18 4L4 18"/>
        </svg>
      </div>

      <div class="ep-inv-card__body">
        <div class="ep-inv-card__head">
          <span v-if="state==='active'" class="ep-eyebrow ep-eyebrow--info">{{ eyebrowLabel }}</span>
          <span v-else-if="state==='expiring'" class="ep-eyebrow ep-eyebrow--gold">{{ eyebrowLabel }}</span>
          <span v-else class="ep-eyebrow ep-inv-card__expired-eyebrow">{{ eyebrowLabel }}</span>
          <time class="ep-mono ep-muted" :datetime="invitation.expiresAt">{{ timeLabel }}</time>
        </div>
        <h3 class="ep-headline ep-headline--sm ep-inv-card__headline">{{ invitation.roomName }}</h3>
        <p class="ep-muted ep-body">
          from <strong class="ep-inv-card__from">@{{ invitation.invitedByUsername }}</strong>
          · {{ metaLine }}
        </p>
      </div>

      <div class="ep-inv-card__foot">
        <span v-if="state==='expired'" class="ep-inv-card__expired-stamp">Expired</span>
        <button class="ep-btn ep-btn--ghost"
          :disabled="state==='expired'" @click="onDecline">Decline</button>
        <button class="ep-btn ep-btn--primary"
          :disabled="state==='expired'" @click="onAccept">{{ acceptLabel }}</button>
      </div>
    </article>
  `,
})
