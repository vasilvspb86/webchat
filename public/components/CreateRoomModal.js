import { app, api, go } from '/app.js'

const { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } = Vue

app.component('create-room-modal', {
  emits: ['close', 'created'],
  setup(_, { emit }) {
    const form = reactive({ name: '', description: '', isPublic: true })
    const errors = reactive({ name: '', description: '', _form: '' })
    const submitting = ref(false)

    const nameInput = ref(null)
    const descInput = ref(null)

    const nameLen = computed(() => form.name.length)
    const descLen = computed(() => form.description.length)

    const clearErrors = () => { errors.name = ''; errors.description = ''; errors._form = '' }

    const focusFirstError = async () => {
      await nextTick()
      if (errors.name) nameInput.value?.focus()
      else if (errors.description) descInput.value?.focus()
    }

    const validate = () => {
      clearErrors()
      const trimmed = form.name.trim()
      if (trimmed.length === 0) errors.name = 'Room name is required.'
      else if (trimmed.length < 3 || trimmed.length > 50) errors.name = 'Room name must be 3–50 characters.'
      if (form.description.trim().length > 500) errors.description = 'Description is too long.'
      return !errors.name && !errors.description
    }

    const mapServerError = (err) => {
      const msg = err?.message || 'Something went wrong.'
      const code = err?.code
      const status = err?.status
      if (status === 401) { go('/login'); return }
      if (status === 409 || code === 'ROOM_NAME_TAKEN') {
        errors.name = `A room named "${form.name.trim()}" already exists.`
        return
      }
      if (status === 400 && code === 'VALIDATION') {
        const m = msg.toLowerCase()
        if (m.includes('description')) errors.description = msg
        else if (m.includes('name')) errors.name = msg
        else errors._form = msg
        return
      }
      errors._form = msg
    }

    const submit = async () => {
      if (submitting.value) return
      if (!validate()) { await focusFirstError(); return }
      submitting.value = true
      try {
        const body = {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isPublic: form.isPublic,
        }
        const { room } = await api('POST', '/api/rooms', body)
        emit('created', room)
        emit('close')
      } catch (e) {
        mapServerError(e)
        await focusFirstError()
      } finally {
        submitting.value = false
      }
    }

    const close = () => emit('close')
    const onScrim = (ev) => { if (ev.target === ev.currentTarget) close() }
    const setVisibility = (isPublic) => { form.isPublic = isPublic }

    onMounted(() => { nameInput.value?.focus() })

    // Swallow global Escape on scrim; root handles keydown
    const onEsc = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onEsc)
    onBeforeUnmount(() => window.removeEventListener('keydown', onEsc))

    return { form, errors, submitting, nameInput, descInput, nameLen, descLen, submit, close, onScrim, setVisibility }
  },
  template: `
    <div class="ep-modal-root" role="dialog" aria-modal="true" aria-labelledby="create-room-title" @keydown.esc="close">
      <div class="ep-modal-scrim" tabindex="-1" @click="onScrim"></div>

      <div class="ep-modal ep-modal--create">
        <header class="ep-modal__head">
          <div class="ep-modal__head-text">
            <span class="ep-eyebrow">New gathering</span>
            <h2 class="ep-headline" id="create-room-title">Open a <em style="font-style:italic;color:var(--accent-primary-hi);">room</em>.</h2>
            <p class="ep-muted ep-body">Give it a name people will recognise across the catalog.</p>
          </div>
          <button type="button" class="ep-btn ep-btn--icon" aria-label="Close" @click="close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </header>

        <div class="ep-modal__body">
          <form class="create-form" autocomplete="off" @submit.prevent="submit">

            <div v-if="errors._form" class="create-form__form-error" role="alert">{{ errors._form }}</div>

            <label class="ep-field" :class="{ 'ep-has-error': errors.name }">
              <span class="ep-field__label">Room name</span>
              <span class="ep-field__hint">3–50 characters. Letters, numbers, dashes.</span>
              <input
                ref="nameInput"
                class="ep-field__input"
                type="text"
                name="name"
                maxlength="50"
                placeholder="coffee-corner"
                v-model="form.name"
                :aria-invalid="!!errors.name"
                @input="errors.name = ''"
              >
              <span class="ep-field__counter ep-mono">{{ nameLen }} / 50</span>
              <span v-if="errors.name" class="ep-field__error" role="alert">{{ errors.name }}</span>
            </label>

            <label class="ep-field" :class="{ 'ep-has-error': errors.description }">
              <span class="ep-field__label">Description <span class="ep-muted" style="text-transform:none;letter-spacing:0;font-weight:400;">(optional)</span></span>
              <span class="ep-field__hint">Up to 500 characters. One line is fine.</span>
              <textarea
                ref="descInput"
                class="ep-field__textarea"
                name="description"
                maxlength="500"
                rows="3"
                placeholder="Roasts, brews, and the slow hours before the day gets loud."
                v-model="form.description"
                :aria-invalid="!!errors.description"
                @input="errors.description = ''"
              ></textarea>
              <span class="ep-field__counter ep-mono">{{ descLen }} / 500</span>
              <span v-if="errors.description" class="ep-field__error" role="alert">{{ errors.description }}</span>
            </label>

            <div class="ep-field ep-field--toggle">
              <span class="ep-field__label">Visibility</span>
              <span class="ep-field__hint">Public rooms appear in the catalog. Private rooms are invite-only.</span>
              <div class="ep-toggle" role="radiogroup" aria-label="Visibility">
                <button type="button" class="ep-toggle__option" :class="{ 'ep-is-active': form.isPublic }" role="radio" :aria-checked="form.isPublic" @click="setVisibility(true)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="6" r="4.5"/><path d="M1.5 6h9M6 1.5c2 1.2 2 7.8 0 9M6 1.5c-2 1.2-2 7.8 0 9"/></svg>
                  Public
                </button>
                <button type="button" class="ep-toggle__option" :class="{ 'ep-is-active': !form.isPublic }" role="radio" :aria-checked="!form.isPublic" @click="setVisibility(false)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5.5" width="6" height="4.5" rx="0.8"/><path d="M4.5 5.5V4a1.5 1.5 0 013 0v1.5"/></svg>
                  Private
                </button>
              </div>
            </div>
          </form>
        </div>

        <footer class="ep-modal__foot">
          <span class="ep-muted ep-body create-form__foot-hint">
            You'll become the first member and only admin.
          </span>
          <button type="button" class="ep-btn ep-btn--ghost" :disabled="submitting" @click="close">Cancel</button>
          <button type="button" class="ep-btn ep-btn--primary" :disabled="submitting" @click="submit">
            {{ submitting ? 'Creating…' : 'Create room' }}
            <svg v-if="!submitting" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 7h12M8 2l5 5-5 5"/></svg>
          </button>
        </footer>
      </div>
    </div>
  `,
})
