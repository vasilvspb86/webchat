import { app } from '/app.js'

const { ref, computed, nextTick } = Vue

const TINTS = ['ember', 'gold', 'moss', 'tide', 'rust']

const hashTint = (username) => {
  if (!username) return ''
  let h = 0
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

const byteLen = (s) => new TextEncoder().encode(s).length

app.component('message-item', {
  props: {
    message: { type: Object, required: true },
    canEdit: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: false },
  },
  emits: ['edit', 'delete', 'reply'],
  setup(props, { emit }) {
    const editing = ref(false)
    const draft = ref('')
    const editorRef = ref(null)

    const variant = computed(() => {
      if (props.message.deleted) return 'system'
      if (props.canEdit) return 'self'
      return 'other'
    })

    const tint = computed(() => {
      if (variant.value === 'system') return ''
      if (variant.value === 'self') return 'ember'
      return hashTint(props.message.author?.username)
    })

    const initial = computed(() => {
      if (variant.value === 'system') return '\u2014'
      const u = props.message.author?.username
      return u ? u.charAt(0).toUpperCase() : '?'
    })

    const formattedTime = computed(() => {
      try {
        return new Date(props.message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } catch {
        return ''
      }
    })

    const ariaLabel = computed(() => {
      if (editing.value) return 'Editing your message'
      if (variant.value === 'system') return 'Deleted message'
      if (variant.value === 'self') return 'Your message'
      return `Message from @${props.message.author?.username || 'deleted'}`
    })

    const replyAriaLabel = computed(() => {
      if (!props.message.replyTo) return ''
      const u = props.message.replyTo.author?.username || props.message.replyTo.authorUsername || 'deleted'
      return `Replying to @${u}`
    })

    const canSave = computed(() => {
      const t = draft.value.trim()
      return t.length > 0 && byteLen(t) <= 3072 && t !== props.message.content
    })

    const startEdit = async () => {
      draft.value = props.message.content || ''
      editing.value = true
      await nextTick()
      editorRef.value?.focus()
    }

    const cancel = () => {
      editing.value = false
    }

    const save = () => {
      const t = draft.value.trim()
      if (!t || byteLen(t) > 3072) return
      if (t === props.message.content) { cancel(); return }
      emit('edit', props.message.id, t)
      editing.value = false
    }

    const doDelete = () => {
      if (!window.confirm('Delete this message?')) return
      emit('delete', props.message.id)
    }

    return {
      editing, draft, editorRef,
      variant, tint, initial,
      formattedTime, ariaLabel, replyAriaLabel,
      canSave,
      startEdit, cancel, save, doDelete,
    }
  },
  template: `
    <article class="ep-msg" :class="{'ep-is-editing': editing}" :data-variant="variant" role="article" :aria-label="ariaLabel">
      <span class="ep-avatar ep-avatar--sm ep-msg__avatar" :data-tint="tint" aria-hidden="true">{{ initial }}</span>

      <header class="ep-msg__head">
        <cite class="ep-msg__author">@{{ message.author?.username || 'deleted' }}</cite>
        <time class="ep-msg__time" :datetime="message.createdAt">{{ formattedTime }}</time>
        <span v-if="message.edited" class="ep-msg__edited">(edited)</span>
        <span v-if="editing" class="ep-msg__edited">(editing)</span>
      </header>

      <blockquote v-if="message.replyTo" class="ep-msg__reply" :class="{'ep-msg__reply--deleted': message.replyTo.deleted}" :aria-label="replyAriaLabel">
        <span v-if="!message.replyTo.deleted" class="ep-msg__reply-author">@{{ message.replyTo.author?.username || message.replyTo.authorUsername || 'deleted' }}</span>
        <span class="ep-msg__reply-body">{{ message.replyTo.deleted ? 'deleted message' : (message.replyTo.content || '') }}</span>
      </blockquote>

      <p v-if="!editing && !message.deleted" class="ep-msg__body">{{ message.content }}</p>
      <p v-else-if="!editing && message.deleted" class="ep-msg__body">This message was deleted.</p>
      <div v-else class="ep-msg__editor">
        <textarea ref="editorRef" rows="2" aria-label="Edit your message" v-model="draft" @keydown.enter.exact.prevent="save" @keydown.esc.prevent="cancel"></textarea>
        <div class="ep-msg__editor-bar">
          <span class="ep-msg__editor-hint"><kbd>Esc</kbd> cancel · <kbd>Enter</kbd> save</span>
          <span class="ep-spacer"></span>
          <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" @click="cancel">Cancel</button>
          <button type="button" class="ep-btn ep-btn--primary ep-btn--sm" :disabled="!canSave" @click="save">Save</button>
        </div>
      </div>

      <div v-if="!editing && !message.deleted && (canEdit || canDelete)" class="ep-msg__actions">
        <button type="button" class="ep-btn ep-btn--icon ep-btn--sm" aria-label="Reply" @click="$emit('reply', message)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3L2 7l4 4M2 7h7a3 3 0 013 3"/></svg>
        </button>
        <button v-if="canEdit" type="button" class="ep-btn ep-btn--icon ep-btn--sm" aria-label="Edit" @click="startEdit">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 2l2.5 2.5-7 7H2.5V9l7-7z"/></svg>
        </button>
        <button v-if="canDelete" type="button" class="ep-btn ep-btn--icon ep-btn--sm" aria-label="Delete" @click="doDelete">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h8M5.5 4V2.5h3V4M4 4l.6 7.5h4.8L10 4"/></svg>
        </button>
      </div>
    </article>
  `,
})
