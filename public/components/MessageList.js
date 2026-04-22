import { app, api, useSocket } from '/app.js'

const { ref, computed, onMounted, onUnmounted, nextTick } = Vue

// ── Helpers ──────────────────────────────────────────────────────────────────

const isoDateKey = (iso) => {
  try { return new Date(iso).toISOString().slice(0, 10) }
  catch { return '' }
}

// ── Component ─────────────────────────────────────────────────────────────────

app.component('message-list', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, default: 'member' },
    meId:   { type: String, default: null },
  },
  emits: ['reply'],

  setup(props, { emit }) {
    const messages      = ref([])
    const nextCursor    = ref(null)
    const typingUsers   = ref({})          // { [userId]: timestamp }
    const containerRef  = ref(null)
    const userDirectory = new Map()        // userId → username (not reactive; internal only)

    const socket = useSocket()
    const unsubs = []
    let staleTimer = null

    // ── Username directory helpers ────────────────────────────────────────────

    const mergeAuthors = (batch) => {
      for (const m of batch) {
        if (m.author?.id && m.author?.username) {
          userDirectory.set(m.author.id, m.author.username)
        }
        if (m.replyTo?.author?.id && m.replyTo?.author?.username) {
          userDirectory.set(m.replyTo.author.id, m.replyTo.author.username)
        }
      }
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    const load = async (before = null) => {
      const q = before ? `?before=${before}` : ''
      const data = await api('GET', `/api/messages/${props.roomId}${q}`)
      const batch = data.messages ?? []
      const cursor = data.nextCursor ?? null
      mergeAuthors(batch)
      if (before) {
        messages.value = [...batch, ...messages.value]
      } else {
        messages.value = batch
      }
      nextCursor.value = cursor
    }

    // Fetch room members to pre-populate the user directory for typing labels.
    const loadMembers = async () => {
      try {
        const data = await api('GET', `/api/rooms/${props.roomId}/members`)
        const list = Array.isArray(data?.members) ? data.members : (Array.isArray(data) ? data : [])
        for (const m of list) {
          if (m.userId && m.username) userDirectory.set(m.userId, m.username)
        }
      } catch {
        // Non-fatal — typing indicators fall back to 'someone'
      }
    }

    // ── Scroll helpers ────────────────────────────────────────────────────────

    const atBottom = () => {
      const el = containerRef.value
      if (!el) return true
      return el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }

    const scrollToBottom = () => {
      const el = containerRef.value
      if (!el) return
      el.scrollTop = el.scrollHeight
    }

    const onScroll = async () => {
      const el = containerRef.value
      if (!el) return
      if (el.scrollTop < 40 && nextCursor.value) {
        const prev = el.scrollHeight
        await load(nextCursor.value)
        await nextTick()
        el.scrollTop = el.scrollHeight - prev
      }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onMounted(async () => {
      await Promise.all([load(), loadMembers()])
      await nextTick()
      scrollToBottom()

      // Live message events
      unsubs.push(
        socket.on('new_message', async (m) => {
          if (m.roomId !== props.roomId) return
          if (m.author?.id && m.author?.username) {
            userDirectory.set(m.author.id, m.author.username)
          }
          const wasBottom = atBottom()
          messages.value = [...messages.value, m]
          await nextTick()
          if (wasBottom) scrollToBottom()
          socket.raw?.emit('mark_read', { roomId: props.roomId, messageId: m.id })
        }),

        socket.on('message_edited', ({ messageId, content }) => {
          const i = messages.value.findIndex((x) => x.id === messageId)
          if (i >= 0) {
            const updated = [...messages.value]
            updated[i] = { ...updated[i], content, edited: true }
            messages.value = updated
          }
        }),

        socket.on('message_deleted', ({ messageId }) => {
          const i = messages.value.findIndex((x) => x.id === messageId)
          if (i >= 0) {
            const updated = [...messages.value]
            updated[i] = { ...updated[i], content: null, deleted: true }
            messages.value = updated
          }
        }),

        // Typing events
        socket.on('typing_start', ({ userId, roomId }) => {
          if (roomId !== props.roomId || userId === props.meId) return
          typingUsers.value = { ...typingUsers.value, [userId]: Date.now() }
        }),

        socket.on('typing_stop', ({ userId, roomId }) => {
          if (roomId !== props.roomId) return
          const { [userId]: _, ...rest } = typingUsers.value
          typingUsers.value = rest
        }),
      )

      // Sweep stale typing entries every 1.5s (covers disconnect-without-stop)
      staleTimer = setInterval(() => {
        const now = Date.now()
        const staleIds = Object.entries(typingUsers.value)
          .filter(([, ts]) => now - ts > 5000)
          .map(([id]) => id)
        if (staleIds.length === 0) return
        const next = { ...typingUsers.value }
        for (const id of staleIds) delete next[id]
        typingUsers.value = next
      }, 1500)
    })

    onUnmounted(() => {
      if (staleTimer !== null) clearInterval(staleTimer)
      while (unsubs.length) { try { unsubs.pop()() } catch {} }
    })

    // ── Outbound socket actions ───────────────────────────────────────────────

    const onEdit   = (id, content) => socket.raw?.emit('edit_message',   { messageId: id, content })
    const onDelete = (id)          => socket.raw?.emit('delete_message', { messageId: id })

    // ── Derived state ─────────────────────────────────────────────────────────

    // Build a flat list of render-buckets: day separators interleaved with messages.
    // Buckets: { kind: 'day', date: String } | { kind: 'msg', message: Object }
    const buckets = computed(() => {
      const result = []
      let lastDay = null
      for (const m of messages.value) {
        const day = isoDateKey(m.createdAt)
        if (day && day !== lastDay) {
          result.push({ kind: 'day', date: m.createdAt })
          lastDay = day
        }
        result.push({ kind: 'msg', message: m })
      }
      return result
    })

    // Resolve typing users to { userId, username }, filter stale (already swept
    // by interval but guard here too), then pass full list to typing-indicator.
    const typingList = computed(() => {
      const now = Date.now()
      return Object.entries(typingUsers.value)
        .filter(([, ts]) => now - ts <= 5000)
        .map(([userId]) => ({
          userId,
          username: userDirectory.get(userId) || 'someone',
        }))
    })

    return {
      buckets,
      typingList,
      containerRef,
      onScroll,
      onEdit,
      onDelete,
      emitReply: (m) => emit('reply', m),
      meId: computed(() => props.meId),
      role:  computed(() => props.role),
    }
  },

  template: `
    <div
      class="ep-msg-list"
      ref="containerRef"
      @scroll="onScroll"
      style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap: var(--space-3); padding: var(--space-4);"
    >
      <template v-for="b in buckets" :key="b.kind === 'day' ? ('d|' + b.date) : b.message.id">
        <day-separator v-if="b.kind === 'day'" :date="b.date" />
        <message-item v-else
          :message="b.message"
          :can-edit="!!(meId && b.message.author?.id === meId && !b.message.deleted)"
          :can-delete="!!((meId && b.message.author?.id === meId) || role === 'admin' || role === 'owner') && !b.message.deleted"
          @edit="onEdit"
          @delete="onDelete"
          @reply="emitReply"
        />
      </template>
      <typing-indicator :typing-users="typingList" />
    </div>
  `,
})
