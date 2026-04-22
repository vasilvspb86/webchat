// Task 18 — Admin Modal with 5 tabs (parent)
// Parent: header + tab switcher. Each tab is its own component and manages its own data.
import { app, api } from '/app.js'
import './MembersTab.js'
import './AdminsTab.js'
import './BannedTab.js'
import './InvitationsTab.js'
import './SettingsTab.js'

const { ref, reactive, computed, onMounted, onBeforeUnmount } = Vue

const TABS = [
  { id: 'members',     label: 'Members',     hasCount: true  },
  { id: 'admins',      label: 'Admins',      hasCount: true  },
  { id: 'banned',      label: 'Banned',      hasCount: true  },
  { id: 'invitations', label: 'Invite',      hasCount: false },
  { id: 'pending',     label: 'Pending',     hasCount: true  },
  { id: 'settings',    label: 'Settings',    hasCount: false },
]

app.component('admin-modal', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true }, // 'owner' | 'admin'
  },
  emits: ['close', 'room-updated', 'room-deleted'],
  setup(props, { emit }) {
    const activeTab = ref('members')
    const room = ref(null)

    // Counts shown on tab labels; each tab emits 'count' once it has fetched its list.
    const counts = reactive({ members: null, admins: null, banned: null, pending: null })
    const onTabCount = (tab, n) => { counts[tab] = n }

    const loadRoom = async () => {
      try { room.value = (await api('GET', `/api/rooms/${props.roomId}`)).room }
      catch { /* parent gates visibility; swallow */ }
    }

    const title = computed(() => {
      const name = room.value?.name || 'room'
      return `${name} · admin`
    })

    const close = () => emit('close')
    const onScrim = (ev) => { if (ev.target === ev.currentTarget) close() }

    const onKeydown = (e) => { if (e.key === 'Escape') close() }

    onMounted(() => {
      loadRoom()
      window.addEventListener('keydown', onKeydown)
    })
    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

    const onUpdated = (payload) => {
      // keep local room in sync so the eyebrow reflects name changes
      if (payload && payload.id) room.value = payload
      emit('room-updated', payload)
    }
    const onDeleted = () => emit('room-deleted')

    return { TABS, activeTab, room, counts, title, close, onScrim, onTabCount, onUpdated, onDeleted }
  },
  template: `
    <div class="ep-modal-root" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" @keydown.esc="close">
      <div class="ep-modal-scrim" tabindex="-1" @click="onScrim"></div>

      <div class="ep-modal ep-modal--admin">
        <header class="ep-modal__head" style="padding-bottom:var(--space-4);">
          <div class="ep-modal__head-text">
            <span class="ep-eyebrow">{{ title }}</span>
            <h2 class="ep-headline" id="admin-modal-title">Manage the room</h2>
          </div>
          <button type="button" class="ep-btn ep-btn--icon" aria-label="Close" @click="close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </header>

        <div class="ep-modal__body">
          <nav class="ep-tabs" role="tablist">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              type="button"
              class="ep-tabs__tab"
              :class="{ 'ep-is-active': activeTab === tab.id }"
              role="tab"
              :aria-selected="activeTab === tab.id"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
              <span v-if="tab.hasCount && counts[tab.id] !== null" class="ep-mono ep-tabs__count">{{ counts[tab.id] }}</span>
            </button>
          </nav>

          <members-tab
            v-if="activeTab === 'members'"
            :room-id="roomId"
            :role="role"
            :room="room"
            @count="onTabCount('members', $event)"
          ></members-tab>
          <admins-tab
            v-else-if="activeTab === 'admins'"
            :room-id="roomId"
            :role="role"
            :room="room"
            @count="onTabCount('admins', $event)"
          ></admins-tab>
          <banned-tab
            v-else-if="activeTab === 'banned'"
            :room-id="roomId"
            :role="role"
            @count="onTabCount('banned', $event)"
          ></banned-tab>
          <invitations-tab
            v-else-if="activeTab === 'invitations'"
            :room-id="roomId"
            :role="role"
            :room="room"
          ></invitations-tab>
          <pending-invitations-tab
            v-else-if="activeTab === 'pending'"
            :room-id="roomId"
            :role="role"
            :room="room"
            @count="onTabCount('pending', $event)"
          ></pending-invitations-tab>
          <settings-tab
            v-else-if="activeTab === 'settings'"
            :room-id="roomId"
            :role="role"
            :room="room"
            @updated="onUpdated"
            @deleted="onDeleted"
          ></settings-tab>
        </div>

        <footer class="ep-modal__foot">
          <span class="ep-muted ep-body" style="margin-right:auto;font-size:var(--text-xs);">
            Changes are saved when you act. Socket.io pushes updates to every member in real time.
          </span>
          <button type="button" class="ep-btn ep-btn--ghost" @click="close">Close</button>
        </footer>
      </div>
    </div>
  `,
})
