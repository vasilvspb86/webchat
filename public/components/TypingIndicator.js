import { app } from '/app.js'

const { computed } = Vue

app.component('typing-indicator', {
  props: { typingUsers: { type: Array, default: () => [] } },
  setup(props) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c])

    const phrase = computed(() => {
      const u = props.typingUsers
      if (u.length === 0) return ''
      const n = (x) => `<strong>@${esc(x.username)}</strong>`
      if (u.length === 1) return `${n(u[0])} is typing`
      if (u.length === 2) return `${n(u[0])} and ${n(u[1])} are typing`
      if (u.length === 3) return `${n(u[0])}, ${n(u[1])} and ${n(u[2])} are typing`
      const rest = u.length - 2
      return `${n(u[0])}, ${n(u[1])} and <strong>${rest} others</strong> are typing`
    })

    return { phrase }
  },
  template: `
    <div v-if="typingUsers.length > 0" class="ep-typing" role="status" aria-live="polite" aria-atomic="true">
      <span v-html="phrase"></span>
      <span class="ep-typing__dots" aria-hidden="true">
        <span class="ep-typing__dot"></span>
        <span class="ep-typing__dot"></span>
        <span class="ep-typing__dot"></span>
      </span>
    </div>
  `,
})
