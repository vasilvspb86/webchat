const { createApp, ref, reactive, computed, onMounted, nextTick } = Vue

createApp({
  setup() {
    // ── State ──────────────────────────────────────────────
    const currentUser = ref(null)
    const screen = ref('login')
    const mainView = ref('rooms-public')
    const authError = ref('')
    const form = reactive({ email: '', username: '', password: '', confirmPassword: '', persistent: false, currentPassword: '', newPassword: '' })

    const myRooms = ref([])
    const publicRooms = ref([])
    const friends = ref([])
    const notifications = ref([])
    const activeRoom = ref(null)
    const roomMembers = ref([])
    const messages = ref([])
    const unreadCounts = reactive({})
    const presenceMap = reactive({}) // userId -> 'online'|'afk'|'offline'

    const inputText = ref('')
    const replyTo = ref(null)
    const editingMsg = ref(null)
    const typingUsers = ref(new Set())
    const loadingMore = ref(false)
    const atTop = ref(false)

    const sidebarSearch = ref('')
    const roomSearch = ref('')
    const friendSearch = ref('')

    const showCreateRoom = ref(false)
    const showManageRoom = ref(false)
    const showInvite = ref(false)
    const inviteUsername = ref('')
    const newRoom = reactive({ name: '', description: '', isPublic: true })

    const messagesEl = ref(null)

    let socket = null
    let typingTimer = null

    // ── Computed ───────────────────────────────────────────
    const isAdminOfActive = computed(() => {
      if (!activeRoom.value || !currentUser.value) return false
      const m = roomMembers.value.find(m => m.userId === currentUser.value.id)
      return m?.isAdmin || activeRoom.value.ownerId === currentUser.value.id
    })

    // ── Helpers ────────────────────────────────────────────
    const api = async (method, url, body) => {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      return data
    }

    const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const getPresence = (userId) => presenceMap[userId] || 'offline'

    const scrollToBottom = () => nextTick(() => {
      if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    })

    // ── Auth ───────────────────────────────────────────────
    const login = async () => {
      authError.value = ''
      try {
        const { user } = await api('POST', '/api/auth/login', { email: form.email, password: form.password, persistent: form.persistent })
        currentUser.value = user
        await boot()
      } catch (e) { authError.value = e.message }
    }

    const register = async () => {
      authError.value = ''
      if (form.password !== form.confirmPassword) return authError.value = 'Passwords do not match'
      try {
        const { user } = await api('POST', '/api/auth/register', { email: form.email, username: form.username, password: form.password })
        currentUser.value = user
        await boot()
      } catch (e) { authError.value = e.message }
    }

    const resetPassword = async () => {
      authError.value = ''
      try {
        await api('POST', '/api/auth/reset-password', { email: form.email, currentPassword: form.currentPassword, newPassword: form.newPassword })
        screen.value = 'login'
        authError.value = ''
      } catch (e) { authError.value = e.message }
    }

    const logout = async () => {
      await api('POST', '/api/auth/logout')
      currentUser.value = null
      if (socket) socket.disconnect()
      socket = null
    }

    // ── Boot (after login) ─────────────────────────────────
    const boot = async () => {
      await Promise.all([loadMyRooms(), loadFriends(), loadPublicRooms()])
      await loadNotifications()
      connectSocket()
      setupPresence()
    }

    const loadMyRooms = async () => {
      const { rooms } = await api('GET', '/api/rooms/mine')
      myRooms.value = rooms
    }

    const loadFriends = async () => {
      const { friends: f } = await api('GET', '/api/users/friends')
      friends.value = f
    }

    const loadPublicRooms = async () => {
      const { rooms } = await api('GET', '/api/rooms/public' + (roomSearch.value ? `?q=${roomSearch.value}` : ''))
      publicRooms.value = rooms
    }

    const loadNotifications = async () => {
      const { notifications: n } = await api('GET', '/api/notifications')
      notifications.value = n
    }

    // ── Socket ─────────────────────────────────────────────
    const connectSocket = () => {
      socket = io({ withCredentials: true })

      socket.on('new_message', (msg) => {
        if (activeRoom.value?.id === msg.roomId) {
          messages.value.push(msg)
          scrollToBottom()
          // Mark read immediately
          socket.emit('mark_read', { roomId: msg.roomId, messageId: msg.id })
        }
      })

      socket.on('message_edited', ({ messageId, content }) => {
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) { msg.content = content; msg.edited = true }
      })

      socket.on('message_deleted', ({ messageId }) => {
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) { msg.deleted = true; msg.content = null }
      })

      socket.on('presence_update', ({ userId, status }) => {
        presenceMap[userId] = status
      })

      socket.on('unread_count', ({ roomId, count }) => {
        if (activeRoom.value?.id !== roomId) unreadCounts[roomId] = count
      })

      socket.on('typing_start', ({ userId: uid, roomId }) => {
        if (activeRoom.value?.id === roomId && uid !== currentUser.value.id) {
          const user = roomMembers.value.find(m => m.userId === uid)
          if (user) typingUsers.value = new Set([...typingUsers.value, user.user.username])
        }
      })

      socket.on('typing_stop', ({ userId: uid }) => {
        const user = roomMembers.value.find(m => m.userId === uid)
        if (user) {
          const s = new Set(typingUsers.value)
          s.delete(user.user.username)
          typingUsers.value = s
        }
      })

      socket.on('notification', (n) => notifications.value.unshift(n))
      socket.on('pending_notifications', (n) => notifications.value = n)
      socket.on('member_banned', ({ roomId, userId }) => {
        if (userId === currentUser.value.id) activeRoom.value = null
        roomMembers.value = roomMembers.value.filter(m => m.userId !== userId)
      })
      socket.on('room_deleted', ({ roomId }) => {
        myRooms.value = myRooms.value.filter(r => r.id !== roomId)
        if (activeRoom.value?.id === roomId) activeRoom.value = null
      })

      // Heartbeat every 10s
      setInterval(() => socket?.emit('heartbeat'), 10_000)
    }

    // ── AFK / Presence (BroadcastChannel for multi-tab) ───
    const setupPresence = () => {
      let idleTimer = null
      const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('webchat_presence') : null

      const goActive = () => {
        clearTimeout(idleTimer)
        bc?.postMessage({ type: 'active' })
        socket?.emit('afk', { idle: false })
        idleTimer = setTimeout(goIdle, 60_000)
      }

      const goIdle = () => {
        bc?.postMessage({ type: 'idle' })
        socket?.emit('afk', { idle: true })
      }

      if (bc) {
        bc.onmessage = ({ data }) => {
          if (data.type === 'active') socket?.emit('afk', { idle: false })
        }
      }

      ['mousemove', 'keydown', 'click', 'scroll'].forEach(e => window.addEventListener(e, goActive, { passive: true }))
      window.addEventListener('beforeunload', () => socket?.disconnect())
      goActive()
    }

    // ── Rooms ──────────────────────────────────────────────
    const openRoom = async (room) => {
      activeRoom.value = room
      messages.value = []
      typingUsers.value = new Set()
      socket?.emit('join_room', { roomId: room.id })
      unreadCounts[room.id] = 0

      const [roomData, msgData] = await Promise.all([
        api('GET', `/api/rooms/${room.id}`),
        api('GET', `/api/messages/${room.id}`),
      ])
      roomMembers.value = roomData.room.members
      activeRoom.value = { ...room, ...roomData.room }
      messages.value = msgData.messages
      scrollToBottom()
    }

    const openDM = async (friend) => {
      // Personal chats stored as rooms — find or note the DM room
      // For now, open a room view scoped to this contact
      // TODO: implement DM room lookup/creation
      console.log('Open DM with', friend.username)
    }

    const joinRoom = async (room) => {
      await api('POST', `/api/rooms/${room.id}/join`)
      await loadMyRooms()
      await openRoom(room)
    }

    const createRoom = async () => {
      try {
        const { room } = await api('POST', '/api/rooms', newRoom)
        myRooms.value.push(room)
        showCreateRoom.value = false
        newRoom.name = ''; newRoom.description = ''; newRoom.isPublic = true
        await openRoom(room)
      } catch (e) { alert(e.message) }
    }

    const inviteUser = async () => {
      try {
        await api('POST', `/api/rooms/${activeRoom.value.id}/invite`, { username: inviteUsername.value })
        showInvite.value = false
        inviteUsername.value = ''
      } catch (e) { alert(e.message) }
    }

    // ── Messages ───────────────────────────────────────────
    const sendOrEdit = async () => {
      if (!inputText.value.trim()) return
      if (editingMsg.value) {
        socket.emit('edit_message', { messageId: editingMsg.value.id, content: inputText.value })
        cancelEdit()
      } else {
        socket.emit('send_message', {
          roomId: activeRoom.value.id,
          content: inputText.value,
          replyToId: replyTo.value?.id || null,
        })
        replyTo.value = null
      }
      inputText.value = ''
      socket.emit('typing_stop', { roomId: activeRoom.value.id })
    }

    const startEdit = (msg) => {
      editingMsg.value = msg
      inputText.value = msg.content
    }

    const cancelEdit = () => {
      editingMsg.value = null
      inputText.value = ''
    }

    const deleteMsg = (msg) => {
      if (confirm('Delete this message?')) socket.emit('delete_message', { messageId: msg.id })
    }

    const onTyping = () => {
      if (!activeRoom.value) return
      socket.emit('typing_start', { roomId: activeRoom.value.id })
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => socket.emit('typing_stop', { roomId: activeRoom.value.id }), 2000)
    }

    const onScroll = async () => {
      if (!messagesEl.value || loadingMore.value) return
      if (messagesEl.value.scrollTop < 50 && messages.value.length > 0) {
        loadingMore.value = true
        const oldest = messages.value[0]
        const { messages: older } = await api('GET', `/api/messages/${activeRoom.value.id}?before=${oldest.id}`)
        if (older.length > 0) {
          const prevHeight = messagesEl.value.scrollHeight
          messages.value = [...older, ...messages.value]
          await nextTick()
          messagesEl.value.scrollTop = messagesEl.value.scrollHeight - prevHeight
        }
        loadingMore.value = false
      }
    }

    // ── Files ──────────────────────────────────────────────
    const handleFileSelect = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const maxSize = file.type.startsWith('image/') ? 3 * 1024 * 1024 : 20 * 1024 * 1024
      if (file.size > maxSize) return alert(`File too large. Max: ${file.type.startsWith('image/') ? '3MB' : '20MB'}`)

      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd, credentials: 'include' })
      const { attachment } = await res.json()

      socket.emit('send_message', {
        roomId: activeRoom.value.id,
        content: inputText.value || null,
        attachmentIds: [attachment.id],
        replyToId: replyTo.value?.id || null,
      })
      inputText.value = ''
      replyTo.value = null
      e.target.value = ''
    }

    const downloadFile = (att) => {
      window.open(`/api/files/${att.id}`, '_blank')
    }

    // ── Friends & Notifications ────────────────────────────
    const sendFriendRequest = async () => {
      if (!friendSearch.value) return
      try {
        await api('POST', '/api/users/friends/request', { username: friendSearch.value })
        friendSearch.value = ''
        alert('Friend request sent!')
      } catch (e) { alert(e.message) }
    }

    const respondNotification = async (n, accept) => {
      await api('POST', `/api/notifications/${n.id}/read`)
      notifications.value = notifications.value.filter(x => x.id !== n.id)

      if (n.type === 'FRIEND_REQUEST') {
        await api('POST', '/api/users/friends/respond', { requesterId: n.payload.fromUserId, accept })
        if (accept) await loadFriends()
      } else if (n.type === 'ROOM_INVITE' && accept) {
        await joinRoom({ id: n.payload.roomId, name: n.payload.roomName })
      }
    }

    // ── Init ───────────────────────────────────────────────
    onMounted(async () => {
      try {
        const { user } = await api('GET', '/api/auth/me')
        currentUser.value = user
        await boot()
      } catch {
        // Not logged in — show auth screen
      }
    })

    return {
      currentUser, screen, mainView, authError, form,
      myRooms, publicRooms, friends, notifications,
      activeRoom, roomMembers, messages, unreadCounts, presenceMap,
      inputText, replyTo, editingMsg, typingUsers, loadingMore,
      sidebarSearch, roomSearch, friendSearch,
      showCreateRoom, showManageRoom, showInvite, inviteUsername, newRoom,
      messagesEl, isAdminOfActive,
      login, register, resetPassword, logout,
      openRoom, openDM, joinRoom, createRoom, inviteUser,
      sendOrEdit, startEdit, cancelEdit, deleteMsg, onTyping, onScroll,
      handleFileSelect, downloadFile,
      sendFriendRequest, respondNotification,
      getPresence, formatTime,
    }
  }
}).mount('#app')
