import { app } from '/app.js'
const { reactive, computed } = Vue

app.component('register-page', {
  props: { flash: { type: String, default: '' } },
  emits: ['submit', 'navigate'],
  setup(_, { emit }) {
    const form = reactive({
      email: '', username: '', password: '', confirmPassword: '',
    })
    const mismatch = computed(() =>
      form.confirmPassword.length > 0 && form.confirmPassword !== form.password
    )
    const submit = () => {
      if (mismatch.value) return
      emit('submit', { ...form })
    }
    return { form, mismatch, submit }
  },
  template: `
    <auth-shell :flash="flash" @brand="$emit('navigate','/login')">
      <template #eyebrow><span class="ep-eyebrow">New account</span></template>
      <template #title><h1 class="ep-auth-card__title">Make a <em>place</em></h1></template>
      <template #blurb>
        <p class="ep-body ep-muted ep-auth-card__blurb">
          A handle, an email, a password you can remember. That's all you need to pull up a chair.
        </p>
      </template>

      <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
        <label class="ep-field" for="reg-email">
          <span class="ep-field__label">Email</span>
          <input id="reg-email" class="ep-field__input" type="email" inputmode="email"
            v-model="form.email" required autocomplete="email" autofocus>
        </label>

        <label class="ep-field" for="reg-username">
          <span class="ep-field__label">Username</span>
          <span class="ep-field__hint">The name you'll go by. Shown with an @ in front.</span>
          <input id="reg-username" class="ep-field__input" type="text"
            v-model="form.username" required autocomplete="username"
            pattern="[A-Za-z0-9_\\-]{2,32}" maxlength="32">
        </label>

        <label class="ep-field" for="reg-password">
          <span class="ep-field__label">Password</span>
          <span class="ep-field__hint">At least 8 characters.</span>
          <input id="reg-password" class="ep-field__input" type="password"
            v-model="form.password" required minlength="8" autocomplete="new-password">
        </label>

        <label class="ep-field" for="reg-confirm" :class="{ 'ep-has-error': mismatch }">
          <span class="ep-field__label">Confirm password</span>
          <input id="reg-confirm" class="ep-field__input" type="password"
            v-model="form.confirmPassword" required minlength="8" autocomplete="new-password"
            :aria-invalid="mismatch">
          <span v-if="mismatch" class="ep-field__error" role="alert">Passwords don't match yet.</span>
        </label>

        <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit"
          :disabled="mismatch" :aria-disabled="mismatch">
          Create account
        </button>
      </form>

      <template #footer>
        <span class="ep-muted">Already have a key?</span>
        <a href="/login" @click.prevent="$emit('navigate','/login')">Sign in instead</a>
      </template>
    </auth-shell>
  `,
})
