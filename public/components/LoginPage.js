import { app } from '/app.js'
const { reactive } = Vue

app.component('login-page', {
  props: { flash: { type: String, default: '' } },
  emits: ['submit', 'navigate'],
  setup(_, { emit }) {
    const form = reactive({ email: '', password: '', persistent: false })
    const submit = () => emit('submit', { ...form })
    return { form, submit }
  },
  template: `
    <auth-shell :flash="flash" @brand="$emit('navigate','/login')">
      <template #eyebrow><span class="ep-eyebrow">Welcome back</span></template>
      <template #title><h1 class="ep-auth-card__title">Come in, it's <em>warm</em></h1></template>
      <template #blurb>
        <p class="ep-body ep-muted ep-auth-card__blurb">
          Your rooms remember where you left off. Sign in to pick up the thread.
        </p>
      </template>

      <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
        <label class="ep-field" for="login-email">
          <span class="ep-field__label">Email</span>
          <input id="login-email" class="ep-field__input" type="email" inputmode="email"
            v-model="form.email" required autocomplete="email" autofocus>
        </label>

        <label class="ep-field" for="login-password">
          <span class="ep-field__label ep-field__label--row">
            <span>Password</span>
            <a class="ep-auth-form__aside" href="/forgot"
              @click.prevent="$emit('navigate','/forgot')">Forgot password?</a>
          </span>
          <input id="login-password" class="ep-field__input" type="password"
            v-model="form.password" required autocomplete="current-password">
        </label>

        <label class="ep-checkbox">
          <input type="checkbox" v-model="form.persistent" class="ep-checkbox__input">
          <span class="ep-checkbox__box" aria-hidden="true">
            <svg viewBox="0 0 12 10" width="12" height="10" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5l3 3 7-7"/></svg>
          </span>
          <span class="ep-checkbox__label">Keep me signed in on this device</span>
        </label>

        <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit">
          Sign in
        </button>
      </form>

      <template #footer>
        <span class="ep-muted">New here?</span>
        <a href="/register" @click.prevent="$emit('navigate','/register')">Make an account</a>
      </template>
    </auth-shell>
  `,
})
