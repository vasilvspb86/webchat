import { app } from '/app.js'
const { reactive } = Vue

app.component('forgot-password-page', {
  props: { flash: { type: String, default: '' } },
  emits: ['submit', 'navigate'],
  setup(_, { emit }) {
    const form = reactive({ email: '' })
    const submit = () => emit('submit', { ...form })
    return { form, submit }
  },
  template: `
    <auth-shell :flash="flash" @brand="$emit('navigate','/login')">
      <template #eyebrow><span class="ep-eyebrow ep-eyebrow--gold">Reset</span></template>
      <template #title><h1 class="ep-auth-card__title">Lost the <em>way in?</em></h1></template>
      <template #blurb>
        <p class="ep-body ep-muted ep-auth-card__blurb">
          Tell us your email. If an account exists, we'll send a link to set a new password.
          The link is single-use and expires quickly.
        </p>
      </template>

      <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
        <label class="ep-field" for="forgot-email">
          <span class="ep-field__label">Email</span>
          <input id="forgot-email" class="ep-field__input" type="email" inputmode="email"
            v-model="form.email" required autocomplete="email" autofocus>
        </label>

        <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit">
          Send reset link
        </button>
      </form>

      <template #footer>
        <span class="ep-muted">Back to</span>
        <a href="/login" @click.prevent="$emit('navigate','/login')">Sign in</a>
      </template>
    </auth-shell>
  `,
})
