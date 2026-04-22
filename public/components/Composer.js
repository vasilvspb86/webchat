import { app } from '/app.js'

const { ref, computed, onUnmounted } = Vue

const uid = (() => { let n = 0; return () => `composer-${++n}` })()

app.component('message-composer', {
  props: {
    roomId:     { type: String, required: true },
    replyDraft: { type: Object, default: null },
  },
  emits: ['send', 'typing-start', 'typing-stop', 'cancel-reply'],
  setup(props, { emit }) {
    const base      = uid()
    const textareaId = `${base}-ta`
    const hintId     = `${base}-hint`
    const counterId  = `${base}-counter`

    const draft   = ref('')
    const focused = ref(false)
    const taRef   = ref(null)

    const MAX_BYTES  = 3072
    const WARN_BYTES = 2816

    const bytes        = computed(() => new TextEncoder().encode(draft.value).length)
    const overLimit    = computed(() => bytes.value > MAX_BYTES)
    const canSend      = computed(() => draft.value.trim().length > 0 && !overLimit.value)
    const counterState = computed(() => overLimit.value ? 'over' : bytes.value >= WARN_BYTES ? 'warn' : 'ok')
    const placeholder  = computed(() =>
      props.replyDraft
        ? `Reply to @${props.replyDraft.author?.username}…`
        : 'Add to the conversation…'
    )

    // ── Typing timers ──
    let typingActive        = false
    let typingHeartbeatTimer = null
    let typingStopTimer      = null

    const clearTimers = () => {
      if (typingHeartbeatTimer) { clearInterval(typingHeartbeatTimer); typingHeartbeatTimer = null }
      if (typingStopTimer)      { clearTimeout(typingStopTimer);       typingStopTimer      = null }
    }

    const stopTyping = () => {
      if (typingActive) { emit('typing-stop'); typingActive = false }
      clearTimers()
    }

    const onInput = () => {
      if (!typingActive && draft.value.length > 0) {
        emit('typing-start')
        typingActive = true
        typingHeartbeatTimer = setInterval(() => { if (typingActive) emit('typing-start') }, 3000)
      }
      if (typingStopTimer) { clearTimeout(typingStopTimer); typingStopTimer = null }
      if (draft.value.length > 0) {
        typingStopTimer = setTimeout(stopTyping, 2000)
      } else {
        stopTyping()
      }
    }

    const send = () => {
      if (!canSend.value) return
      emit('send', { content: draft.value.trim(), replyToId: props.replyDraft?.id ?? null })
      draft.value = ''
      stopTyping()
    }

    const onKeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend.value) send()
      }
    }

    onUnmounted(() => { if (typingActive) emit('typing-stop'); clearTimers() })

    return {
      draft, focused, taRef,
      textareaId, hintId, counterId,
      bytes, overLimit, canSend, counterState, placeholder,
      onInput, onKeydown, send,
    }
  },
  template: `
    <form class="ep-composer" aria-label="Message the room" @submit.prevent="send">

      <div v-if="replyDraft" class="ep-composer__reply-chip" role="status" aria-live="polite">
        <span class="ep-composer__reply-chip-body" style="display:flex;flex-direction:column;gap:2px;min-width:0;">
          <span><strong>Replying to @{{ replyDraft.author?.username || 'deleted' }}</strong></span>
          <span class="ep-composer__reply-chip-preview">{{ replyDraft.content || 'deleted message' }}</span>
        </span>
        <button type="button" class="ep-composer__reply-chip-close" aria-label="Dismiss reply" @click="$emit('cancel-reply')">×</button>
      </div>

      <div class="ep-composer__shell" :class="{ 'ep-is-focused': focused, 'ep-is-over-limit': overLimit }">
        <label class="ep-visually-hidden" :for="textareaId">Message</label>
        <textarea :id="textareaId"
          ref="taRef"
          class="ep-composer__textarea"
          rows="2"
          :placeholder="placeholder"
          v-model="draft"
          :aria-describedby="hintId + ' ' + counterId"
          @focus="focused = true"
          @blur="focused = false"
          @input="onInput"
          @keydown="onKeydown"></textarea>

        <div class="ep-composer__footer">
          <span class="ep-composer__hint" :id="hintId">
            <kbd>Shift</kbd>+<kbd>Enter</kbd> newline · <kbd>Enter</kbd> send
          </span>
          <span class="ep-composer__counter" :id="counterId" :data-state="counterState" aria-live="polite">
            {{ bytes }}&nbsp;/&nbsp;3&#x202F;072&nbsp;B
          </span>
          <button type="submit"
            class="ep-btn ep-btn--primary ep-btn--sm ep-composer__send"
            :aria-disabled="!canSend"
            :disabled="!canSend">
            Send
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 6h8M7 2l3 4-3 4"/></svg>
          </button>
        </div>
      </div>
    </form>
  `,
})
