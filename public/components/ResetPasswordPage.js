import { app } from '/app.js'
const { reactive, computed } = Vue

app.component('reset-password-page', {
  props: { flash: { type: String, default: '' } },
  emits: ['submit', 'navigate'],
  setup(_, { emit }) {
    const form = reactive({ newPassword: '', confirm: '' })
    const mismatch = computed(() =>
      form.confirm.length > 0 && form.confirm !== form.newPassword
    )
    const submit = () => {
      if (mismatch.value) return
      emit('submit', { ...form })
    }
    return { form, mismatch, submit }
  },
  template: `
    <auth-shell :flash="flash" @brand="$emit('navigate','/login')">
      <template #eyebrow><span class="ep-eyebrow ep-eyebrow--gold">Reset</span></template>
      <template #title><h1 class="ep-auth-card__title">Set a <em>new key</em></h1></template>
      <template #blurb>
        <p class="ep-body ep-muted ep-auth-card__blurb">
          Pick something you'll remember tomorrow. Every existing session will be signed out once you save.
        </p>
      </template>

      <form class="ep-auth-form" @submit.prevent="submit" autocomplete="off">
        <label class="ep-field" for="reset-new">
          <span class="ep-field__label">New password</span>
          <span class="ep-field__hint">At least 8 characters.</span>
          <input id="reset-new" class="ep-field__input" type="password"
            v-model="form.newPassword" required minlength="8" autocomplete="new-password" autofocus>
        </label>

        <label class="ep-field" for="reset-confirm" :class="{ 'ep-has-error': mismatch }">
          <span class="ep-field__label">Confirm new password</span>
          <input id="reset-confirm" class="ep-field__input" type="password"
            v-model="form.confirm" required minlength="8" autocomplete="new-password"
            :aria-invalid="mismatch">
          <span v-if="mismatch" class="ep-field__error" role="alert">Passwords don't match yet.</span>
        </label>

        <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit"
          :disabled="mismatch" :aria-disabled="mismatch">
          Save new password
        </button>
      </form>

      <template #footer>
        <span class="ep-muted">Changed your mind?</span>
        <a href="/login" @click.prevent="$emit('navigate','/login')">Back to sign in</a>
      </template>
    </auth-shell>
  `,
})
