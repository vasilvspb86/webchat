import { app } from '/app.js'

const { computed } = Vue

const TINTS = ['ember', 'gold', 'moss', 'tide', 'rust']
const tintFor = (s) => {
  if (!s) return 'ember'
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return TINTS[Math.abs(hash) % TINTS.length]
}

const rankOf = (m) => m.isOwner ? 0 : (m.isAdmin ? 1 : 2)

app.component('members-panel', {
  props: {
    roomId: { type: String, required: true },
    role: { type: String, default: 'none' }, // 'owner'|'admin'|'member'|'none'|'banned'
    members: { type: Array, required: true },
  },
  setup(props) {
    // Sort: owner first, then admins (alphabetical), then members (alphabetical).
    const sorted = computed(() => {
      return [...props.members].sort((a, b) => {
        const ra = rankOf(a), rb = rankOf(b)
        if (ra !== rb) return ra - rb
        return (a.username || '').localeCompare(b.username || '')
      })
    })

    // Presence is not yet available — group everyone under "Online" for now.
    const onlineMembers = computed(() => sorted.value)
    const awayMembers = computed(() => [])
    const offlineMembers = computed(() => [])

    const total = computed(() => props.members.length)
    const canManage = computed(() => props.role === 'owner' || props.role === 'admin')

    const chipFor = (m) => {
      if (m.isOwner) return { cls: 'ep-chip--owner', label: 'Owner' }
      if (m.isAdmin) return { cls: 'ep-chip--admin', label: 'Admin' }
      return { cls: 'ep-chip--member', label: 'Member' }
    }
    const avatarLetter = (m) => (m.username || '?').charAt(0).toUpperCase()

    return { sorted, onlineMembers, awayMembers, offlineMembers, total, canManage, chipFor, avatarLetter, tintFor }
  },
  template: `
    <aside class="ep-pane ep-pane--members" aria-label="Members">
      <div class="members">

        <header class="members__head">
          <span class="ep-eyebrow ep-eyebrow--quiet">Members &middot; {{ total }}</span>
        </header>

        <div class="members__section" v-if="onlineMembers.length">
          <div class="members__section-title">
            <span>Online</span><span class="ep-mono">{{ onlineMembers.length }}</span>
          </div>
          <ul class="members__list" role="list">
            <li
              v-for="m in onlineMembers"
              :key="m.userId"
              class="ep-member-row"
              data-presence="online"
            >
              <span class="ep-avatar ep-avatar--sm" :data-tint="tintFor(m.username)" aria-hidden="true">{{ avatarLetter(m) }}</span>
              <span class="ep-member-row__name">@{{ m.username }}</span>
              <span :class="['ep-chip', chipFor(m).cls]">{{ chipFor(m).label }}</span>
              <span class="ep-presence-dot" data-presence="online" aria-label="Online"></span>
              <button
                v-if="canManage"
                class="ep-btn ep-btn--icon ep-btn--sm row-menu"
                aria-label="Member actions"
                type="button"
                disabled
              >&hellip;</button>
              <span v-else aria-hidden="true"></span>
            </li>
          </ul>
        </div>

        <div class="members__section" v-if="awayMembers.length">
          <div class="members__section-title">
            <span>Away</span><span class="ep-mono">{{ awayMembers.length }}</span>
          </div>
        </div>

        <div class="members__section" v-if="offlineMembers.length">
          <div class="members__section-title">
            <span>Offline</span><span class="ep-mono">{{ offlineMembers.length }}</span>
          </div>
        </div>

        <p v-if="!total" class="ep-muted" style="padding: var(--space-4); font-size: var(--text-xs);">
          No members yet.
        </p>
      </div>
    </aside>
  `,
})
