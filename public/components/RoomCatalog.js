// Task 15 — Public Room Catalog
// Lists public rooms with search + pagination. Top nav chrome matches mockup.
import { app, api, useSocket, go } from '/app.js'
const { ref, computed, onMounted, onUnmounted, watch } = Vue

app.component('room-catalog', {
  props: { showCreate: { type: Boolean, default: false } },
  emits: ['navigate'],
  setup(props, { emit }) {
    const rooms = ref([])
    const nextCursor = ref(null)
    const cursorStack = ref([]) // cursors used to reach the current page (for "Newer")
    const loading = ref(true)
    const error = ref(null)
    const query = ref('')
    const me = ref(null)

    const socket = useSocket()
    const unsubs = []
    let searchTimer = null

    const activeQuery = computed(() => query.value.trim())

    const fetchRooms = async ({ cursor = null } = {}) => {
      loading.value = true
      error.value = null
      try {
        const params = new URLSearchParams()
        if (activeQuery.value) params.set('q', activeQuery.value)
        if (cursor) params.set('cursor', cursor)
        const qs = params.toString()
        const data = await api('GET', `/api/rooms${qs ? `?${qs}` : ''}`)
        rooms.value = data.rooms || []
        nextCursor.value = data.nextCursor || null
      } catch (e) {
        if (e.status === 401) { go('/login'); return }
        error.value = e.message || 'Failed to load rooms'
        rooms.value = []
        nextCursor.value = null
      } finally {
        loading.value = false
      }
    }

    const loadMe = async () => {
      try { me.value = (await api('GET', '/api/auth/me')).user } catch { me.value = null }
    }

    // ── search: debounced 250ms, resets pagination ──
    watch(query, () => {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        cursorStack.value = []
        fetchRooms()
      }, 250)
    })

    // ── pagination ──
    const pageIndex = computed(() => cursorStack.value.length + 1)
    const hasPrev = computed(() => cursorStack.value.length > 0)
    const hasNext = computed(() => Boolean(nextCursor.value))
    const lastCreatedAt = computed(() => {
      const r = rooms.value[rooms.value.length - 1]
      return r ? r.createdAt : null
    })

    const goOlder = () => {
      if (!hasNext.value || !lastCreatedAt.value) return
      cursorStack.value = [...cursorStack.value, lastCreatedAt.value]
      fetchRooms({ cursor: lastCreatedAt.value })
    }
    const goNewer = () => {
      if (!hasPrev.value) return
      cursorStack.value = []
      fetchRooms()
    }

    // ── actions ──
    const openRoom = (room) => emit('navigate', `#/rooms/${room.id}`)
    const openCreate = () => emit('navigate', '#/rooms/new')
    const openInvitations = () => emit('navigate', '#/invitations')
    const clearSearch = () => { query.value = '' }
    const retry = () => fetchRooms()

    // ── modal bridge ──
    const closeCreate = () => emit('navigate', '#/rooms')
    const onCreated = (payload) => {
      const room = payload && payload.room ? payload.room : payload
      if (room && room.id) emit('navigate', `#/rooms/${room.id}`)
      else emit('navigate', '#/rooms')
    }

    // ── live updates ──
    const indexById = (id) => rooms.value.findIndex(r => r.id === id)
    const onRoomUpdated = ({ roomId, fields } = {}) => {
      const i = indexById(roomId); if (i < 0 || !fields) return
      if (fields.isPublic === false) { rooms.value.splice(i, 1); return }
      const next = { ...rooms.value[i] }
      if ('name' in fields) next.name = fields.name
      if ('description' in fields) next.description = fields.description
      rooms.value.splice(i, 1, next)
    }
    const onRoomDeleted = ({ roomId } = {}) => {
      const i = indexById(roomId); if (i >= 0) rooms.value.splice(i, 1)
    }
    const bumpMember = (delta) => ({ roomId } = {}) => {
      const i = indexById(roomId); if (i < 0) return
      const next = { ...rooms.value[i] }
      next.memberCount = Math.max(0, (next.memberCount || 0) + delta)
      rooms.value.splice(i, 1, next)
    }

    onMounted(() => {
      loadMe()
      fetchRooms()
      unsubs.push(
        socket.on('room_updated', onRoomUpdated),
        socket.on('room_deleted', onRoomDeleted),
        socket.on('member_joined', bumpMember(+1)),
        socket.on('member_left', bumpMember(-1)),
      )
    })

    onUnmounted(() => {
      if (searchTimer) clearTimeout(searchTimer)
      for (const u of unsubs) { try { u && u() } catch { /* noop */ } }
    })

    const state = computed(() => {
      if (error.value) return 'error'
      if (loading.value) return 'loading'
      if (rooms.value.length === 0) return activeQuery.value ? 'no-results' : 'empty'
      return 'normal'
    })

    return {
      rooms, query, loading, error, me,
      state, pageIndex, hasPrev, hasNext,
      openRoom, openCreate, openInvitations, clearSearch, retry,
      goOlder, goNewer, closeCreate, onCreated,
    }
  },
  template: `
    <div class="ep-app">
      <header class="ep-app__top">
        <div class="ep-app__brand">Ember<em>&amp;</em>Pitch</div>
        <nav class="ep-app__nav">
          <a href="#/rooms" class="ep-is-active" @click.prevent="$emit('navigate','#/rooms')">Rooms</a>
          <a href="#/invitations" @click.prevent="openInvitations">Invitations</a>
          <a href="#" @click.prevent>Friends</a>
        </nav>
        <a class="ep-app__user" href="/profile" @click.prevent="$emit('navigate','/profile')" aria-label="Go to profile">
          <span class="ep-muted" v-if="me">@{{ me.username }}</span>
          <span class="ep-avatar ep-avatar--md" data-tint="ember" aria-hidden="true">
            {{ (me && me.username ? me.username[0] : '?').toUpperCase() }}
          </span>
        </a>
      </header>

      <main class="ep-app__main ep-layout-single">
        <section class="catalog">

          <header class="catalog__mast">
            <div class="catalog__title">
              <span class="ep-eyebrow">The parlour</span>
              <h1 class="ep-display">Public <em>rooms</em>, lit and open.</h1>
              <div class="catalog__rule"></div>
              <p class="ep-body ep-body--lead ep-muted catalog__lede">
                Pull up a chair. Every room here is visible to anyone signed in, newest first.
                Private rooms live off this page, by invitation only.
              </p>
            </div>
            <div class="catalog__tools">
              <label class="catalog__search" aria-label="Search rooms">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                  <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
                </svg>
                <input v-model="query" type="search" placeholder="Search name or description…">
              </label>
              <button class="ep-btn ep-btn--primary" @click="openCreate">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 1v12M1 7h12"/></svg>
                Create room
              </button>
            </div>
          </header>

          <div class="catalog__strip">
            <span class="ep-eyebrow ep-eyebrow--quiet">
              <template v-if="state==='loading'">Loading rooms…</template>
              <template v-else-if="state==='normal'">{{ rooms.length }} {{ rooms.length === 1 ? 'room' : 'rooms' }} · newest first</template>
              <template v-else>—</template>
            </span>
            <span class="catalog__count">page {{ pageIndex }}</span>
          </div>

          <!-- Error -->
          <section v-if="state==='error'" class="ep-empty">
            <div class="ep-empty__art" aria-hidden="true">⟁</div>
            <h2 class="ep-headline">Something broke.</h2>
            <p class="ep-body ep-muted">{{ error }}</p>
            <button class="ep-btn ep-btn--ghost" @click="retry">Try again</button>
          </section>

          <!-- Loading skeletons -->
          <div v-else-if="state==='loading'" class="catalog__grid" aria-busy="true" aria-live="polite">
            <article v-for="n in 6" :key="'s'+n" class="ep-card ep-room-card ep-is-skeleton">
              <header class="ep-room-card__head">
                <h3 class="ep-headline ep-headline--sm">&nbsp;</h3>
              </header>
              <p class="ep-body ep-body--clamp-3 ep-muted">&nbsp;</p>
              <footer class="ep-room-card__foot"><span>&nbsp;</span></footer>
            </article>
          </div>

          <!-- Empty: no rooms at all -->
          <section v-else-if="state==='empty'" class="ep-empty">
            <div class="ep-empty__art" aria-hidden="true">&amp;</div>
            <h2 class="ep-headline">No rooms yet.</h2>
            <p class="ep-body ep-muted">Be the first to open the door.</p>
            <button class="ep-btn ep-btn--primary" @click="openCreate">Create the first one</button>
          </section>

          <!-- No-results for a query -->
          <section v-else-if="state==='no-results'" class="ep-empty">
            <div class="ep-empty__art" aria-hidden="true">?</div>
            <h2 class="ep-headline">Nothing matches "{{ query }}".</h2>
            <p class="ep-body ep-muted">Try a shorter or different term.</p>
            <button class="ep-btn ep-btn--ghost" @click="clearSearch">Clear search</button>
          </section>

          <!-- Normal grid -->
          <div v-else class="catalog__grid">
            <article v-for="room in rooms" :key="room.id" class="ep-card ep-room-card" data-visibility="public"
              tabindex="0" role="link" @click="openRoom(room)"
              @keydown.enter.prevent="openRoom(room)" @keydown.space.prevent="openRoom(room)">
              <header class="ep-room-card__head">
                <h3 class="ep-headline ep-headline--sm">{{ room.name }}</h3>
                <span class="ep-chip ep-chip--public">Public</span>
              </header>
              <p class="ep-body ep-body--clamp-3 ep-muted">{{ room.description || 'No description yet.' }}</p>
              <footer class="ep-room-card__foot">
                <span class="ep-meta">
                  <span class="ep-mono">{{ room.memberCount }}</span>
                  <span class="ep-muted">{{ room.memberCount === 1 ? 'member' : 'members' }}</span>
                </span>
                <button class="ep-btn ep-btn--ghost ep-btn--sm" @click.stop="openRoom(room)">Open</button>
              </footer>
            </article>
          </div>

          <!-- Pagination (only when we have a normal result set) -->
          <nav v-if="state==='normal'" class="catalog__page" aria-label="Pagination">
            <button class="ep-btn ep-btn--ghost ep-btn--sm" :disabled="!hasPrev" @click="goNewer">← Newer</button>
            <span class="ep-mono ep-muted">page {{ pageIndex }}</span>
            <button class="ep-btn ep-btn--ghost ep-btn--sm" :disabled="!hasNext" @click="goOlder">Older →</button>
          </nav>

        </section>
      </main>

      <create-room-modal v-if="showCreate" @close="closeCreate" @created="onCreated"></create-room-modal>
    </div>
  `,
})
