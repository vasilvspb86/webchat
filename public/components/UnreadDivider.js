import { app } from '/app.js'

app.component('unread-divider', {
  template: `
    <div class="ep-unread-div" role="separator" aria-label="New messages">
      <span class="ep-unread-div__label">New</span>
    </div>
  `,
})
