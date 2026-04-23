// Profile page — Ember & Pitch skin.
// Presentational: all side-effects (API, navigation, flash) live in the
// parent. Owns its own form state and the delete-account confirm dialog.
import { app } from '/app.js'
const { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } = Vue

const parseUA = (ua) => {
  if (!ua) return { label: 'Unknown device', icon: 'unknown' }
  const browser =
    /Firefox\/\d/.test(ua)         ? 'Firefox' :
    /Edg\/\d/.test(ua)             ? 'Edge'    :
    /OPR\/\d|Opera\/\d/.test(ua)   ? 'Opera'   :
    /Chrome\/\d/.test(ua)          ? 'Chrome'  :
    /Safari\/\d/.test(ua)          ? 'Safari'  :
                                     'Unknown browser'
  const platform =
    /iPhone|iPad|iPod/.test(ua)    ? 'iOS'     :
    /Android/.test(ua)             ? 'Android' :
    /Windows/.test(ua)             ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua)  ? 'macOS'   :
    /Linux|X11/.test(ua)           ? 'Linux'   :
                                     'Unknown'
  const icon =
    platform === 'iOS' || platform === 'Android' ? 'mobile' :
    platform === 'Unknown' ? 'unknown' : 'desktop'
  return { label: `${browser} on ${platform}`, icon }
}

const fmtWhen = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d)) return ''
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

app.component('profile-page', {
  props: {
    me:       { type: Object, default: null },
    sessions: { type: Array,  default: () => [] },
    flash:    { type: String, default: '' },
  },
  emits: ['change-password', 'revoke', 'sign-out', 'delete-account', 'navigate'],
  setup(props, { emit }) {
    const form = reactive({ currentPassword: '', newPassword: '' })
    const confirming = ref(false)
    const cancelBtn = ref(null)

    const canSubmit = computed(() =>
      form.currentPassword.length >= 1 && form.newPassword.length >= 8
    )

    const submitPassword = () => {
      if (!canSubmit.value) return
      emit('change-password', {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
      })
      form.currentPassword = ''
      form.newPassword = ''
    }

    const askDelete = () => {
      confirming.value = true
      nextTick(() => cancelBtn.value?.focus())
    }
    const cancelDelete  = () => { confirming.value = false }
    const confirmDelete = () => { confirming.value = false; emit('delete-account') }

    const avatarInitial = computed(() =>
      (props.me?.username || '?').charAt(0).toUpperCase()
    )
    const sessionsSorted = computed(() => {
      const arr = [...(props.sessions || [])]
      return arr.sort((a, b) =>
        (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0) ||
        new Date(b.createdAt || b.expire) - new Date(a.createdAt || a.expire)
      )
    })

    const onKey = (e) => { if (e.key === 'Escape' && confirming.value) cancelDelete() }
    onMounted(() => window.addEventListener('keydown', onKey))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

    return {
      form, confirming, cancelBtn,
      canSubmit, submitPassword,
      askDelete, cancelDelete, confirmDelete,
      avatarInitial, sessionsSorted,
      parseUA, fmtWhen,
    }
  },
  template: `
    <div class="ep-app">
      <header class="ep-app__top" role="banner">
        <div class="ep-app__brand">Ember<em>&amp;</em>Pitch</div>
        <nav class="ep-app__nav">
          <a href="#/rooms" @click.prevent="$emit('navigate','#/rooms')">Rooms</a>
          <a href="#/rooms/mine" @click.prevent="$emit('navigate','#/rooms/mine')">My rooms</a>
          <a href="#/invitations" @click.prevent="$emit('navigate','#/invitations')">Invitations</a>
        </nav>
        <div class="ep-app__user" v-if="me" aria-current="page" aria-label="Your profile">
          <span class="ep-muted">@{{ me.username }}</span>
          <span class="ep-avatar ep-avatar--md" data-tint="ember" aria-hidden="true">{{ avatarInitial }}</span>
        </div>
      </header>

      <main class="ep-app__main ep-layout-single" style="padding: var(--space-6) 0 var(--space-10);">
        <section class="ep-pane" style="padding:0;">
          <div class="ep-profile">

            <div v-if="flash" class="ep-auth-flash ep-profile__flash" role="status" aria-live="polite">
              <span class="ep-auth-flash__dot" aria-hidden="true"></span>
              <span>{{ flash }}</span>
            </div>

            <header class="ep-profile__head">
              <span class="ep-eyebrow">Your account</span>
              <h1>Tending your <em>own thread</em></h1>
              <p class="ep-body ep-body--lead ep-muted" style="max-width: 60ch;">
                The devices you've trusted, the key you use, and the last door before you leave.
              </p>
            </header>

            <section class="ep-profile-card ep-profile-identity" aria-labelledby="profile-id-title">
              <span class="ep-avatar ep-avatar--xl" data-tint="ember" aria-hidden="true">{{ avatarInitial }}</span>
              <div class="ep-profile-identity__body">
                <h2 class="ep-profile-identity__name" id="profile-id-title">@{{ me?.username }}</h2>
                <p class="ep-profile-identity__email ep-mono">{{ me?.email }}</p>
              </div>
              <button type="button" class="ep-btn ep-btn--ghost" @click="$emit('sign-out')">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 10v1.5a1 1 0 01-1 1H2.5a1 1 0 01-1-1v-9a1 1 0 011-1h5a1 1 0 011 1V4"/><path d="M5.5 7h7M10 4.5L12.5 7 10 9.5"/></svg>
                Sign out
              </button>
            </section>

            <section class="ep-profile-card" aria-labelledby="pw-title">
              <header class="ep-profile-card__head">
                <span class="ep-eyebrow ep-eyebrow--gold">Credential</span>
                <h2 class="ep-headline" id="pw-title">Change password</h2>
                <p class="ep-muted ep-body">Changing your password signs every other session out but leaves this one alone.</p>
              </header>
              <form class="ep-profile-form" @submit.prevent="submitPassword" autocomplete="off">
                <label class="ep-field" for="pw-current">
                  <span class="ep-field__label">Current password</span>
                  <input id="pw-current" class="ep-field__input" type="password"
                    v-model="form.currentPassword" required autocomplete="current-password">
                </label>
                <label class="ep-field" for="pw-new">
                  <span class="ep-field__label">New password</span>
                  <span class="ep-field__hint">At least 8 characters. A passphrase is kinder than a pattern.</span>
                  <input id="pw-new" class="ep-field__input" type="password"
                    v-model="form.newPassword" minlength="8" required autocomplete="new-password">
                </label>
                <div class="ep-profile-form__actions">
                  <button type="submit" class="ep-btn ep-btn--primary"
                    :aria-disabled="!canSubmit" :disabled="!canSubmit">
                    Update password
                  </button>
                </div>
              </form>
            </section>

            <section class="ep-profile-card" aria-labelledby="sess-title">
              <header class="ep-profile-card__head">
                <span class="ep-eyebrow ep-eyebrow--info">Devices</span>
                <h2 class="ep-headline" id="sess-title">Active sessions</h2>
                <p class="ep-muted ep-body">One entry for every device that can read your messages. Revoke anything that doesn't look familiar.</p>
              </header>

              <ul class="ep-session-list" v-if="sessionsSorted.length">
                <li v-for="s in sessionsSorted" :key="s.sid" class="ep-session-row"
                    :data-current="s.isCurrent ? 'true' : 'false'">
                  <span class="ep-session-row__icon" aria-hidden="true">
                    <svg v-if="parseUA(s.userAgent).icon === 'mobile'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M7 21h10M12 17v4"/></svg>
                  </span>
                  <div class="ep-session-row__body">
                    <div class="ep-session-row__head">
                      <span class="ep-session-row__device">{{ parseUA(s.userAgent).label }}</span>
                      <span v-if="s.isCurrent" class="ep-chip ep-chip--admin" role="status"
                            aria-label="This is the session you are currently using">This device</span>
                    </div>
                    <div class="ep-session-row__meta">
                      <time class="ep-mono" :datetime="s.createdAt || s.expire">Opened {{ fmtWhen(s.createdAt || s.expire) }}</time>
                      <span class="ep-session-row__dot" aria-hidden="true">·</span>
                      <span class="ep-mono">{{ s.ip || 'unknown ip' }}</span>
                    </div>
                  </div>
                  <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm"
                    :aria-label="s.isCurrent ? 'Revoke the current session — this will sign you out' : 'Revoke this session'"
                    @click="$emit('revoke', s.sid)">
                    Revoke
                  </button>
                </li>
              </ul>
              <div v-else class="ep-session-list__empty" role="status">
                <span class="ep-session-list__ornament" aria-hidden="true">&middot; &middot; &middot;</span>
                <p class="ep-body ep-muted">No active sessions listed. That's unusual — even this one should show up.</p>
              </div>
            </section>

            <section class="ep-danger-zone" aria-labelledby="dz-title">
              <header class="ep-danger-zone__head">
                <span class="ep-eyebrow ep-danger-zone__eyebrow">Danger zone</span>
                <h2 class="ep-headline" id="dz-title">Delete account</h2>
              </header>
              <p class="ep-body">
                Your owned rooms, messages, and invitations will be permanently erased.
                Other rooms where you're only a member will forget you ever showed up.
                <strong>This cannot be undone.</strong>
              </p>
              <div class="ep-danger-zone__actions">
                <button type="button" class="ep-btn ep-btn--danger" @click="askDelete">
                  Delete my account
                </button>
              </div>
            </section>

            <nav class="ep-profile-footnav" aria-label="Other pages">
              <a href="#/rooms" @click.prevent="$emit('navigate','#/rooms')">Browse rooms</a>
              <span class="ep-profile-footnav__sep" aria-hidden="true">·</span>
              <a href="#/invitations" @click.prevent="$emit('navigate','#/invitations')">Your invitations</a>
            </nav>

          </div>
        </section>
      </main>

      <Teleport to="body">
        <div v-if="confirming" class="ep-modal-root" role="dialog" aria-modal="true"
             aria-labelledby="confirm-title" aria-describedby="confirm-body">
          <div class="ep-modal-scrim" tabindex="-1" @click="cancelDelete"></div>
          <div class="ep-modal ep-modal--sm ep-confirm">
            <header class="ep-modal__head">
              <div class="ep-modal__head-text">
                <span class="ep-eyebrow ep-danger-zone__eyebrow">This is final</span>
                <h2 class="ep-headline" id="confirm-title">Delete this account?</h2>
              </div>
            </header>
            <div class="ep-modal__body">
              <p class="ep-body" id="confirm-body">
                Your owned rooms and every message inside them will be permanently erased.
                Every session will be signed out. <strong>This cannot be undone.</strong>
              </p>
            </div>
            <footer class="ep-modal__foot">
              <button type="button" class="ep-btn ep-btn--ghost" ref="cancelBtn" @click="cancelDelete">
                Keep my account
              </button>
              <button type="button" class="ep-btn ep-btn--danger" @click="confirmDelete">
                Delete permanently
              </button>
            </footer>
          </div>
        </div>
      </Teleport>
    </div>
  `,
})
