import { app } from '/app.js'
const { computed } = Vue

app.component('day-separator', {
  props: { date: { type: [String, Date], required: true } },
  setup(props) {
    const sameYMD = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()

    const label = computed(() => {
      const d = props.date instanceof Date ? props.date : new Date(props.date)
      if (isNaN(d.getTime())) return ''
      const now = new Date()
      const yday = new Date(now); yday.setDate(yday.getDate() - 1)
      if (sameYMD(d, now)) return 'Today'
      if (sameYMD(d, yday)) return 'Yesterday'
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      }
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    })

    return { label }
  },
  template: `
    <div class="ep-day-sep" role="separator" :aria-label="label">
      <span class="ep-day-sep__plate">{{ label }}</span>
    </div>
  `,
})
