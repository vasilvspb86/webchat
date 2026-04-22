import { app, api, useSocket } from '/app.js'

const { ref, computed, onMounted, onUnmounted, watch } = Vue

const fmtMonthYear = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) }
  catch { return '' }
}

app.component('room-page', {
  props: { roomId: { type: String, required: true } },
  emits: ['navigate'],
  setup(props, { emit }) {
    const room = ref(null)
    const members = ref([])
    const me = ref(null)
    const loading = ref(true)
    const status = ref('ok') // 'ok' | 'notfound' | 'error'
    const showAdmin = ref(false)
    const flash = ref('')
    const replyDraft = ref(null)
    const joining = ref(false)

    const socket = useSocket()
    const unsubs = []

    // ── Role resolution (server enforces; client gates UI only) ──
    const myRow = computed(() => me.value ? (members.value.find(m => m.userId === me.value.id) || null) : null)
    const role = computed(() => {
      const r = myRow.value
      if (!r) return 'none'
      if (r.isOwner) return 'owner'
      if (r.isAdmin) return 'admin'
      return 'member'
    })
    const isAdminOrOwner = computed(() => role.value === 'owner' || role.value === 'admin')
    const isNonOwner = computed(() => role.value !== 'owner' && role.value !== 'none')
    // Spec §6.5: non-members of a public room see only room info + Join CTA.
    // Derived from role (no RoomMember row) rather than a 403 from /members,
    // because the current backend serves /members to any reader.
    const isNonMember = computed(() => !!(room.value?.isPublic && role.value === 'none'))

    const setFlash = (m) => { flash.value = m; setTimeout(() => { if (flash.value === m) flash.value = '' }, 4000) }

    // ── Data load ──
    const load = async () => {
      loading.value = true
      status.value = 'ok'
      try {
        const [r, auth] = await Promise.all([
          api('GET', `/api/rooms/${props.roomId}`),
          api('GET', '/api/auth/me').catch(() => ({ user: null })),
        ])
        room.value = r?.room || r
        me.value = auth.user || null
        try {
          const ms = await api('GET', `/api/rooms/${props.roomId}/members`)
          members.value = Array.isArray(ms?.members) ? ms.members : (Array.isArray(ms) ? ms : [])
        } catch (e) {
          if (e?.status === 403 && room.value?.isPublic) {
            members.value = []
          } else {
            throw e
          }
        }
      } catch (e) {
        status.value = e?.status === 404 ? 'notfound' : 'error'
      } finally {
        loading.value = false
      }
    }

    const onJoin = async () => {
      if (joining.value) return
      joining.value = true
      try {
        await api('POST', `/api/rooms/${props.roomId}/join`)
        await load()
      } catch (e) {
        setFlash(e?.message || 'Could not join this room')
      } finally {
        joining.value = false
      }
    }

    // ── Socket wiring ──
    const gated = (fn) => (p) => { if (p && p.roomId === props.roomId) fn(p) }
    const bumpCount = (delta) => { if (room.value) room.value.memberCount = Math.max(0, (room.value.memberCount || 0) + delta) }

    const wireSockets = () => {
      unsubs.push(
        socket.on('member_joined', gated(({ member }) => {
          if (!member) return
          if (!members.value.find(m => m.userId === member.userId)) {
            members.value = [...members.value, member]
            bumpCount(+1)
          }
        })),
        socket.on('member_left', gated(({ userId }) => {
          const before = members.value.length
          members.value = members.value.filter(m => m.userId !== userId)
          if (members.value.length !== before) bumpCount(-1)
        })),
        socket.on('member_banned', gated(({ userId }) => {
          members.value = members.value.filter(m => m.userId !== userId)
        })),
        socket.on('admin_granted', gated(({ userId }) => {
          members.value = members.value.map(m => m.userId === userId ? { ...m, isAdmin: true } : m)
        })),
        socket.on('admin_revoked', gated(({ userId }) => {
          members.value = members.value.map(m => m.userId === userId ? { ...m, isAdmin: false } : m)
        })),
        socket.on('room_updated', gated(({ fields }) => {
          if (room.value && fields) room.value = { ...room.value, ...fields }
        })),
        socket.on('room_deleted', gated(() => {
          setFlash('This room was deleted.')
          emit('navigate', '#/rooms')
        })),
      )
    }
    const unwireSockets = () => { while (unsubs.length) { try { unsubs.pop()() } catch {} } }

    // ── Actions ──
    const onManage = () => { showAdmin.value = true }
    const onLeave = async () => {
      try { await api('POST', `/api/rooms/${props.roomId}/leave`); emit('navigate', '#/rooms') }
      catch (e) { setFlash(e.message || 'Could not leave room') }
    }
    const onRoomUpdated = (fields) => { if (room.value && fields) room.value = { ...room.value, ...fields } }
    const onRoomDeleted = () => { setFlash('This room was deleted.'); emit('navigate', '#/rooms') }

    // ── Messaging wiring ──
    const onReply = (m) => { replyDraft.value = m ? { id: m.id, author: m.author, content: m.content } : null }
    const cancelReply = () => { replyDraft.value = null }
    const onSend = ({ content, replyToId }) => {
      socket.raw?.emit('send_message', { roomId: props.roomId, content, replyToId: replyToId ?? null })
      replyDraft.value = null
    }
    const onTypingStart = () => socket.raw?.emit('typing_start', { roomId: props.roomId })
    const onTypingStop  = () => socket.raw?.emit('typing_stop',  { roomId: props.roomId })
    const goRooms = () => emit('navigate', '#/rooms')
    const goInvitations = () => emit('navigate', '#/invitations')
    const retry = () => load()

    // ── Derived ──
    const memberCount = computed(() => room.value?.memberCount ?? members.value.length)
    const onlineCount = computed(() => members.value.length) // presence not wired yet
    const openedLabel = computed(() => fmtMonthYear(room.value?.createdAt))
    const visibilityLabel = computed(() => room.value?.isPublic ? 'Public' : 'Private')
    const visibilityChipClass = computed(() => room.value?.isPublic ? 'ep-chip--public' : 'ep-chip--private')
    const youChipLabel = computed(() => {
      if (role.value === 'owner') return 'You \u00b7 Owner'
      if (role.value === 'admin') return 'You \u00b7 Admin'
      if (role.value === 'member') return 'You \u00b7 Member'
      return ''
    })
    const youChipClass = computed(() =>
      role.value === 'owner' ? 'ep-chip--owner'
      : role.value === 'admin' ? 'ep-chip--admin'
      : 'ep-chip--member')
    const adminCount = computed(() => members.value.filter(m => m.isAdmin || m.isOwner).length)

    // ── Lifecycle ──
    onMounted(async () => { await load(); wireSockets() })
    onUnmounted(unwireSockets)
    watch(() => props.roomId, async (nv, ov) => {
      if (nv === ov) return
      unwireSockets(); await load(); wireSockets()
    })

    return {
      room, members, me, loading, status, showAdmin, flash,
      replyDraft,
      joining,
      role, isAdminOrOwner, isNonOwner, isNonMember,
      memberCount, onlineCount, openedLabel, visibilityLabel, visibilityChipClass,
      youChipLabel, youChipClass, adminCount,
      onManage, onLeave, onRoomUpdated, onRoomDeleted, onJoin, goRooms, goInvitations, retry,
      onReply, cancelReply, onSend, onTypingStart, onTypingStop,
    }
  },
  template: `
    <div class="ep-app">
      <header class="ep-app__top" role="banner">
        <div class="ep-app__brand">Ember<em>&amp;</em>Pitch</div>
        <nav class="ep-app__nav">
          <a href="#/rooms" class="ep-is-active" @click.prevent="goRooms">Rooms</a>
          <a href="#/rooms/mine" @click.prevent="$emit('navigate','#/rooms/mine')">My rooms</a>
          <a href="#/invitations" @click.prevent="goInvitations">Invitations</a>
        </nav>
        <a class="ep-app__user" v-if="me" href="/profile" @click.prevent="$emit('navigate','/profile')" aria-label="Go to profile">
          <span class="ep-muted">@{{ me.username }}</span>
          <span class="ep-avatar ep-avatar--md" data-tint="ember" aria-hidden="true">{{ (me.username || '?').charAt(0).toUpperCase() }}</span>
        </a>
      </header>

      <div v-if="flash" class="flash" role="status" aria-live="polite">{{ flash }}</div>

      <main v-if="loading" class="ep-app__main ep-layout-room" aria-busy="true">
        <section class="ep-pane ep-pane--primary" style="padding:0;">
          <div class="room-header">
            <div class="skeleton-line" style="width:40%;height:14px;"></div>
            <div class="skeleton-line" style="width:55%;height:28px;"></div>
            <div class="skeleton-line" style="width:72%;height:14px;"></div>
            <div class="skeleton-line" style="width:60%;height:14px;"></div>
          </div>
          <div class="ep-stage ep-stage--empty">
            <div class="skeleton-line" style="width:160px;height:96px;border-radius:var(--radius-md);"></div>
          </div>
        </section>
        <aside class="ep-pane ep-pane--members" aria-label="Members">
          <div class="skeleton-line" style="width:50%;height:12px;margin-bottom:var(--space-5);"></div>
          <div v-for="n in 6" :key="n" class="skeleton-row"></div>
        </aside>
      </main>

      <main v-else-if="status==='notfound'" class="ep-app__main ep-layout-single">
        <div class="ep-empty">
          <div class="ep-empty__art" aria-hidden="true">?</div>
          <h1 class="ep-headline">This room is out of reach.</h1>
          <p class="ep-body ep-body--lead ep-muted">Either it never existed or it was closed for you.</p>
          <button class="ep-btn ep-btn--ghost" @click="goRooms">Back to rooms</button>
        </div>
      </main>

      <main v-else-if="status==='error'" class="ep-app__main ep-layout-single">
        <div class="ep-empty">
          <div class="ep-empty__art" aria-hidden="true">&#x27C1;</div>
          <h1 class="ep-headline">Something broke.</h1>
          <p class="ep-body ep-body--lead ep-muted">The room didn't load. Give it another try.</p>
          <button class="ep-btn ep-btn--ghost" @click="retry">Try again</button>
        </div>
      </main>

      <main v-else-if="isNonMember" class="ep-app__main ep-layout-single">
        <section class="ep-pane ep-pane--primary" style="padding:0;">
          <header class="room-header">
            <div class="room-header__top">
              <div class="room-header__name">
                <div class="room-header__crumbs">
                  <a href="#/rooms" @click.prevent="goRooms">Rooms</a>
                  <span class="sep">/</span>
                  <span class="ep-muted">{{ room.name }}</span>
                </div>
                <div class="room-header__title">
                  <h1 class="ep-headline">{{ room.name }}</h1>
                  <span :class="['ep-chip', visibilityChipClass]">{{ visibilityLabel }}</span>
                </div>
              </div>
            </div>
            <p v-if="room.description" class="ep-body ep-body--lead ep-muted room-header__desc">{{ room.description }}</p>
            <div class="room-header__stats">
              <div class="room-header__stat">
                <span class="room-header__stat-value">{{ memberCount }}</span>
                <span class="room-header__stat-label">{{ memberCount === 1 ? 'member' : 'members' }}</span>
              </div>
              <div class="room-header__stat">
                <span class="room-header__stat-value">{{ onlineCount }}</span>
                <span class="room-header__stat-label">online</span>
              </div>
              <div class="room-header__stat" v-if="openedLabel">
                <span class="room-header__stat-value">{{ openedLabel }}</span>
                <span class="room-header__stat-label">opened</span>
              </div>
            </div>
          </header>
          <section class="ep-empty" style="flex:1;">
            <div class="ep-empty__art" aria-hidden="true">&amp;</div>
            <h2 class="ep-headline">Pull up a chair.</h2>
            <p class="ep-body ep-body--lead ep-muted">Join to read the conversation and add your voice.</p>
            <button class="ep-btn ep-btn--primary" :disabled="joining" @click="onJoin">
              {{ joining ? 'Joining\u2026' : 'Join this room' }}
            </button>
          </section>
        </section>
      </main>

      <main v-else class="ep-app__main ep-layout-room">
        <section class="ep-pane ep-pane--primary" style="padding:0;">
          <header class="room-header">
            <div class="room-header__top">
              <div class="room-header__name">
                <div class="room-header__crumbs">
                  <a href="#/rooms" @click.prevent="goRooms">Rooms</a>
                  <span class="sep">/</span>
                  <span class="ep-muted">{{ room.name }}</span>
                </div>
                <div class="room-header__title">
                  <h1 class="ep-headline">{{ room.name }}</h1>
                  <span :class="['ep-chip', visibilityChipClass]">{{ visibilityLabel }}</span>
                  <span v-if="youChipLabel" :class="['ep-chip', youChipClass]">{{ youChipLabel }}</span>
                  <span class="ep-muted ep-meta" v-if="adminCount">
                    <span class="ep-mono">{{ adminCount }}</span>
                    <span>{{ adminCount === 1 ? 'admin' : 'admins' }}</span>
                  </span>
                </div>
              </div>
              <div class="room-header__actions">
                <button v-if="isAdminOrOwner" class="ep-btn ep-btn--ghost ep-btn--sm" @click="onManage">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="2"/><path d="M11 7a4 4 0 11-8 0 4 4 0 018 0zM7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13"/></svg>
                  Manage room
                </button>
                <button v-if="isNonOwner" class="ep-btn ep-btn--danger ep-btn--sm" @click="onLeave">Leave room</button>
              </div>
            </div>

            <p v-if="room.description" class="ep-body ep-body--lead ep-muted room-header__desc">{{ room.description }}</p>

            <div class="room-header__stats">
              <div class="room-header__stat">
                <span class="room-header__stat-value">{{ memberCount }}</span>
                <span class="room-header__stat-label">{{ memberCount === 1 ? 'member' : 'members' }}</span>
              </div>
              <div class="room-header__stat">
                <span class="room-header__stat-value">{{ onlineCount }}</span>
                <span class="room-header__stat-label">online</span>
              </div>
              <div class="room-header__stat" v-if="openedLabel">
                <span class="room-header__stat-value">{{ openedLabel }}</span>
                <span class="room-header__stat-label">opened</span>
              </div>
            </div>
          </header>

          <div class="ep-stage" style="display:flex; flex-direction:column; min-height:0; flex:1;" aria-label="Messages area">
            <message-list
              :room-id="roomId"
              :role="role"
              :me-id="me?.id"
              @reply="onReply"
            />
            <message-composer
              :room-id="roomId"
              :reply-draft="replyDraft"
              @send="onSend"
              @typing-start="onTypingStart"
              @typing-stop="onTypingStop"
              @cancel-reply="cancelReply"
            />
          </div>
        </section>

        <members-panel :room-id="roomId" :role="role" :members="members" />
      </main>

      <admin-modal
        v-if="showAdmin"
        :room-id="roomId"
        :role="role"
        @close="showAdmin = false"
        @room-updated="onRoomUpdated"
        @room-deleted="onRoomDeleted"
      />
    </div>
  `,
})
