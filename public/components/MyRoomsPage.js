import { app, api } from '/app.js'
const { ref, computed, onMounted } = Vue

const fmtTime = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const yday = new Date(now); yday.setDate(yday.getDate() - 1)
    const sameYday = d.getFullYear() === yday.getFullYear() && d.getMonth() === yday.getMonth() && d.getDate() === yday.getDate()
    if (sameYday) return 'yesterday'
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}

const TINTS = ['ember', 'gold', 'moss', 'tide', 'rust']
const tintFor = (name) => {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

app.component('my-rooms-page', {
  props: { me: { type: Object, default: null } },
  emits: ['navigate'],
  setup(props, { emit }) {
    const rooms = ref([])
    const loading = ref(true)
    const error = ref('')

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        const data = await api('GET', '/api/rooms/mine')
        rooms.value = Array.isArray(data?.rooms) ? data.rooms : []
      } catch (e) {
        error.value = e?.message || 'Failed to load your rooms'
        rooms.value = []
      } finally {
        loading.value = false
      }
    }

    onMounted(load)

    const openRoom = (room) => emit('navigate', `#/rooms/${room.id}`)
    const goRooms = () => emit('navigate', '#/rooms')
    const goInvitations = () => emit('navigate', '#/invitations')
    const goMine = () => emit('navigate', '#/rooms/mine')

    const roleLabel = (r) => r.isOwner ? 'Owner' : r.isAdmin ? 'Admin' : 'Member'
    const roleChipClass = (r) => r.isOwner ? 'ep-chip--owner' : r.isAdmin ? 'ep-chip--admin' : 'ep-chip--member'

    return {
      rooms, loading, error,
      openRoom, goRooms, goInvitations, goMine,
      roleLabel, roleChipClass, tintFor, fmtTime,
    }
  },
  template: `
    <div class="ep-app">
      <header class="ep-app__top" role="banner">
        <div class="ep-app__brand">Ember<em>&amp;</em>Pitch</div>
        <nav class="ep-app__nav">
          <a href="#/rooms" @click.prevent="goRooms">Rooms</a>
          <a href="#/rooms/mine" class="ep-is-active" @click.prevent="goMine">My rooms</a>
          <a href="#/invitations" @click.prevent="goInvitations">Invitations</a>
        </nav>
        <a class="ep-app__user" v-if="me" href="/profile" @click.prevent="$emit('navigate','/profile')" aria-label="Go to profile">
          <span class="ep-muted">@{{ me.username }}</span>
          <span class="ep-avatar ep-avatar--md" data-tint="ember" aria-hidden="true">{{ (me.username || '?').charAt(0).toUpperCase() }}</span>
        </a>
      </header>

      <main class="ep-app__main ep-layout-single" style="padding: var(--space-6) 0 var(--space-10);">
        <section class="ep-pane" style="padding:0;">
          <div class="ep-my-rooms">

            <header class="ep-my-rooms__head">
              <span class="ep-eyebrow">Your rooms</span>
              <h1>The places <em>you already belong</em></h1>
              <p class="ep-body ep-body--lead ep-muted" style="max-width: 60ch;">
                Rooms you've opened, been made admin of, or joined. Sorted by the last message.
              </p>
            </header>

            <div v-if="loading" class="ep-muted ep-body">Loading your rooms…</div>
            <div v-else-if="error" class="ep-field__error" role="alert">{{ error }}</div>
            <div v-else-if="rooms.length === 0" class="ep-empty" style="padding:var(--space-7) 0;">
              <h2 class="ep-headline ep-headline--sm">No rooms yet.</h2>
              <p class="ep-body ep-muted">Join a public room or create one to get started.</p>
              <button class="ep-btn ep-btn--primary" @click="goRooms">Browse rooms</button>
            </div>

            <div v-else role="list" style="display: grid; gap: var(--space-3);">
              <a v-for="r in rooms" :key="r.id" class="ep-room-row"
                :href="'#/rooms/' + r.id"
                role="listitem"
                :aria-label="r.name"
                @click.prevent="openRoom(r)">
                <span class="ep-avatar ep-avatar--lg" :data-tint="tintFor(r.name)" aria-hidden="true">{{ (r.name || '?').charAt(0).toUpperCase() }}</span>
                <div class="ep-room-row__body">
                  <div class="ep-room-row__title">
                    <span class="ep-room-row__name">{{ r.name }}</span>
                    <span :class="['ep-chip', roleChipClass(r)]">{{ roleLabel(r) }}</span>
                    <span :class="['ep-chip', r.isPublic ? 'ep-chip--public' : 'ep-chip--private']">{{ r.isPublic ? 'Public' : 'Private' }}</span>
                  </div>
                  <div v-if="r.description" class="ep-room-row__preview">
                    <span>{{ r.description }}</span>
                  </div>
                  <div v-else class="ep-room-row__preview ep-room-row__preview--empty">
                    {{ r.lastMessageAt ? 'Conversation in progress.' : 'Nothing said here yet.' }}
                  </div>
                </div>
                <div class="ep-room-row__meta">
                  <time v-if="r.lastMessageAt" class="ep-room-row__time" :datetime="r.lastMessageAt">{{ fmtTime(r.lastMessageAt) }}</time>
                  <time v-else class="ep-room-row__time ep-muted" :datetime="r.createdAt">opened {{ fmtTime(r.createdAt) }}</time>
                </div>
              </a>
            </div>

          </div>
        </section>
      </main>
    </div>
  `,
})
