// Task 19 — Invitation Inbox screen
// Lists pending ROOM_INVITE notifications with accept/decline actions.
// Mirrors docs/superpowers/design-system/mockups/invitations.html.
import './InvitationCard.js'
import { app, api, useSocket } from '/app.js'
const { ref, computed, onMounted, onUnmounted } = Vue

app.component('invitation-inbox', {
  emits: ['navigate'],
  setup(_, { emit }) {
    const invitations = ref([])
    const loading = ref(true)
    const error = ref(null)
    const me = ref(null)

    const socket = useSocket()
    const unsubs = []

    // Normalize a server Notification row into the shape InvitationCard expects.
    const fromNotification = (n) => {
      const p = (n && n.payload) || {}
      return {
        id: n.id, roomId: p.roomId,
        roomName: p.roomName || 'Untitled room',
        invitedByUsername: p.invitedByUsername || 'someone',
        memberCount: typeof p.memberCount === 'number' ? p.memberCount : undefined,
        isPublic: typeof p.isPublic === 'boolean' ? p.isPublic : undefined,
        expiresAt: n.expiresAt, createdAt: n.createdAt,
      }
    }

    const loadInvitations = async () => {
      loading.value = true; error.value = null
      try {
        let raw
        try { raw = await api('GET', '/api/notifications?type=ROOM_INVITE') }
        catch (e) {
          if (e.status === 401) { emit('navigate', '/login'); return }
          raw = await api('GET', '/api/notifications')
        }
        const rows = Array.isArray(raw) ? raw : (raw.notifications || [])
        invitations.value = rows.filter(n => n && n.type === 'ROOM_INVITE').map(fromNotification)
      } catch (e) {
        if (e.status === 401) { emit('navigate', '/login'); return }
        error.value = e.message || 'Failed to load invitations'
        invitations.value = []
      } finally { loading.value = false }
    }

    const loadMe = async () => {
      try { me.value = (await api('GET', '/api/auth/me')).user } catch { me.value = null }
    }

    const findIndexById = (id) => invitations.value.findIndex(n => n.id === id)
    const removeById = (id) => { const i = findIndexById(id); if (i >= 0) invitations.value.splice(i, 1) }
    const markExpired = (id) => {
      const i = findIndexById(id); if (i < 0) return
      invitations.value.splice(i, 1, { ...invitations.value[i], expiresAt: new Date(0).toISOString() })
    }

    const flash = ref('')
    const setFlash = (m) => { flash.value = m; setTimeout(() => { flash.value = '' }, 4000) }
    const handleErr = (e, id, verb) => {
      if (e.status === 404) { setFlash("That invitation isn't yours anymore."); removeById(id) }
      else if (e.status === 410) { setFlash('This invitation expired.'); markExpired(id) }
      else { setFlash(e.message || `Could not ${verb}.`) }
    }

    const accept = async (id) => {
      const inv = invitations.value.find(n => n.id === id)
      if (!inv) return
      try {
        await api('POST', `/api/invitations/${id}/accept`)
        const roomId = inv.roomId
        removeById(id)
        if (roomId) emit('navigate', `#/rooms/${roomId}`)
      } catch (e) { handleErr(e, id, 'accept') }
    }
    const decline = async (id) => {
      try { await api('POST', `/api/invitations/${id}/decline`); removeById(id) }
      catch (e) { handleErr(e, id, 'decline') }
    }

    const onMemberJoined = ({ roomId, member } = {}) => {
      if (!roomId || !member || !me.value || member.userId !== me.value.id) return
      const i = invitations.value.findIndex(n => n.roomId === roomId)
      if (i >= 0) invitations.value.splice(i, 1)
    }

    onMounted(() => {
      loadMe()
      loadInvitations()
      unsubs.push(socket.on('member_joined', onMemberJoined))
    })
    onUnmounted(() => { for (const u of unsubs) { try { u && u() } catch { /* noop */ } } })

    const state = computed(() => {
      if (error.value) return 'error'
      if (loading.value) return 'loading'
      if (invitations.value.length === 0) return 'empty'
      return 'normal'
    })

    const browseRooms = () => emit('navigate', '#/rooms')
    const retry = () => loadInvitations()

    return { invitations, state, error, me, flash, accept, decline, browseRooms, retry }
  },
  template: `
    <div class="ep-app">
      <header class="ep-app__top">
        <div class="ep-app__brand">Ember<em>&amp;</em>Pitch</div>
        <nav class="ep-app__nav">
          <a href="#/rooms" @click.prevent="$emit('navigate','#/rooms')">Rooms</a>
          <a href="#/invitations" class="ep-is-active" @click.prevent>Invitations</a>
          <a href="#" @click.prevent>Friends</a>
        </nav>
        <div class="ep-app__user">
          <span class="ep-muted" v-if="me">@{{ me.username }}</span>
          <span class="ep-avatar ep-avatar--md" data-tint="ember" aria-hidden="true">
            {{ (me && me.username ? me.username[0] : '?').toUpperCase() }}
          </span>
        </div>
      </header>

      <main class="ep-app__main ep-layout-single">
        <section class="inbox">
          <header class="inbox__mast">
            <span class="ep-eyebrow ep-eyebrow--info">Your inbox</span>
            <h1 class="ep-display">Open <em>doors</em>, someone held for you.</h1>
            <div class="inbox__rule"></div>
            <p class="ep-body ep-body--lead ep-muted inbox__lede">
              Private rooms require an invitation. Each one here is a standing offer.
              Decline politely, accept before it expires, or let it lapse.
            </p>
          </header>

          <div v-if="flash" class="flash" role="status" aria-live="polite">{{ flash }}</div>

          <!-- Error -->
          <section v-if="state==='error'" class="ep-empty">
            <div class="ep-empty__art" aria-hidden="true">⟁</div>
            <h2 class="ep-headline">Something broke.</h2>
            <p class="ep-body ep-muted">{{ error }}</p>
            <button class="ep-btn ep-btn--ghost" @click="retry">Try again</button>
          </section>

          <!-- Loading skeletons -->
          <div v-else-if="state==='loading'" class="inbox__list" aria-busy="true" aria-live="polite">
            <article v-for="n in 3" :key="'s'+n" class="ep-inv-card ep-is-skeleton" data-state="active">
              <div class="ep-inv-card__icon" aria-hidden="true"></div>
              <div class="ep-inv-card__body">
                <div class="ep-inv-card__head"><span>&nbsp;</span><time>&nbsp;</time></div>
                <h3 class="ep-headline ep-headline--sm">&nbsp;</h3>
                <p class="ep-body ep-muted">&nbsp;</p>
              </div>
              <div class="ep-inv-card__foot"></div>
            </article>
          </div>

          <!-- Empty -->
          <section v-else-if="state==='empty'" class="ep-empty">
            <div class="ep-empty__art" aria-hidden="true">&amp;</div>
            <h2 class="ep-headline">Your inbox is quiet.</h2>
            <p class="ep-body ep-muted">Every invitation you receive lands here until you act on it.</p>
            <a class="ep-btn ep-btn--ghost" href="#/rooms" @click.prevent="browseRooms">Browse public rooms →</a>
          </section>

          <!-- Normal list -->
          <div v-else class="inbox__list">
            <invitation-card v-for="inv in invitations" :key="inv.id"
              :invitation="inv" @accept="accept" @decline="decline"></invitation-card>
          </div>
        </section>
      </main>
    </div>
  `,
})
