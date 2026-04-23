// AuthShell — the quiet hearth-like wrapper used by the four auth pages.
// Provides: atmospheric backdrop, centered brandmark, single editorial
// card, optional footer-links row, and a subtle signature line at the
// bottom. No logic; slots only.
import { app } from '/app.js'

app.component('auth-shell', {
  props: {
    flash: { type: String, default: '' },
  },
  emits: ['brand'],
  template: `
    <div class="ep-auth-shell">

      <header class="ep-auth-shell__top">
        <a href="/" class="ep-auth-shell__brand"
          @click.prevent="$emit('brand')" aria-label="Ember and Pitch home">
          <span class="ep-auth-shell__spark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c1.5 2.4 3.2 3.6 3.2 6.2 0 2-1.4 3.2-3.2 3.2s-3.2-1.2-3.2-3.2C8.8 6.6 10.5 5.4 12 3z"/>
              <path d="M7 14c0 3 2.2 6 5 6s5-3 5-6c0-1.3-.6-2.4-1.4-3.3"/>
            </svg>
          </span>
          <span class="ep-auth-shell__wordmark">Ember<em>&amp;</em>Pitch</span>
        </a>
      </header>

      <div v-if="flash" class="ep-auth-flash" role="status" aria-live="polite">
        <span class="ep-auth-flash__dot" aria-hidden="true"></span>
        <span>{{ flash }}</span>
      </div>

      <main class="ep-auth-shell__main">
        <article class="ep-auth-card">
          <header class="ep-auth-card__head">
            <slot name="eyebrow" />
            <slot name="title" />
            <slot name="blurb" />
          </header>

          <div class="ep-auth-card__body">
            <slot />
          </div>

          <footer class="ep-auth-card__foot" v-if="$slots.footer">
            <slot name="footer" />
          </footer>
        </article>
      </main>

      <footer class="ep-auth-shell__mark" aria-hidden="true">
        <span>&mdash;</span>
        <span class="ep-auth-shell__mark-text">a conversation by firelight</span>
        <span>&mdash;</span>
      </footer>

    </div>
  `,
})
