// Task 18 — Settings tab. Name/description/visibility + danger zone.
import { app, api } from '/app.js'
const { ref, reactive, computed, onMounted, watch } = Vue

app.component('settings-tab', {
  props: {
    roomId: { type: String, required: true },
    role:   { type: String, required: true },
    room:   { type: Object, default: null },
  },
  emits: ['updated', 'deleted'],
  setup(props, { emit }) {
    const form = reactive({ name: '', description: '', isPublic: true })
    const errors = reactive({ name: '', description: '', _form: '' })
    const saving = reactive({ name: false, description: false, visibility: false, deleting: false })
    const flash = ref('')
    const loaded = ref(false)

    // Only the owner can edit anything here (server enforces too).
    const canEdit = computed(() => props.role === 'owner')

    const hydrate = (room) => {
      if (!room) return
      form.name = room.name || ''
      form.description = room.description || ''
      form.isPublic = room.isPublic !== false
      loaded.value = true
    }

    const fetchRoom = async () => {
      try {
        const { room } = await api('GET', `/api/rooms/${props.roomId}`)
        hydrate(room)
      } catch (e) { errors._form = e.message || 'Failed to load room' }
    }

    const mapError = (e, field) => {
      const code = e?.code
      const status = e?.status
      if (code === 'NAME_TAKEN' || status === 409) { errors.name = `A room named "${form.name.trim()}" already exists.`; return }
      if (code === 'INVALID_NAME') { errors.name = e.message; return }
      if (code === 'INVALID_DESCRIPTION') { errors.description = e.message; return }
      if (code === 'INVALID_VISIBILITY') { errors._form = e.message; return }
      if (field === 'name') errors.name = e.message || 'Failed to save'
      else if (field === 'description') errors.description = e.message || 'Failed to save'
      else errors._form = e.message || 'Failed to save'
    }

    const patch = async (fields, field, savingKey) => {
      if (saving[savingKey]) return
      errors[field === 'visibility' ? '_form' : field] = ''
      errors._form = ''
      saving[savingKey] = true
      try {
        const { room } = await api('PATCH', `/api/rooms/${props.roomId}`, fields)
        hydrate(room)
        flash.value = 'Saved.'
        emit('updated', room)
      } catch (e) { mapError(e, field) }
      finally { saving[savingKey] = false }
    }

    const saveName = () => {
      const t = form.name.trim()
      if (t.length < 3 || t.length > 50) { errors.name = 'Room name must be 3–50 characters.'; return }
      patch({ name: t }, 'name', 'name')
    }
    const saveDescription = () => {
      if (form.description.length > 500) { errors.description = 'Description is too long.'; return }
      patch({ description: form.description }, 'description', 'description')
    }
    const setVisibility = (isPublic) => {
      if (form.isPublic === isPublic) return
      patch({ isPublic }, 'visibility', 'visibility')
    }

    const destroy = async () => {
      if (saving.deleting) return
      const ok = confirm('Delete this room permanently? All messages and members will be removed. This cannot be undone.')
      if (!ok) return
      saving.deleting = true
      try {
        await api('DELETE', `/api/rooms/${props.roomId}`)
        emit('deleted')
      } catch (e) { errors._form = e.message || 'Failed to delete' }
      finally { saving.deleting = false }
    }

    onMounted(() => { if (props.room) hydrate(props.room); else fetchRoom() })
    watch(() => props.room, (r) => { if (r && !loaded.value) hydrate(r) })
    watch(flash, (v) => { if (v) setTimeout(() => { if (flash.value === v) flash.value = '' }, 2500) })

    const nameLen = computed(() => form.name.length)
    const descLen = computed(() => form.description.length)

    return { form, errors, saving, flash, loaded, canEdit, nameLen, descLen, saveName, saveDescription, setVisibility, destroy }
  },
  template: `
    <section class="admin-pane" role="tabpanel" aria-label="Settings">
      <div v-if="errors._form" class="ep-field__error" role="alert">{{ errors._form }}</div>
      <div v-if="flash" class="ep-eyebrow ep-eyebrow--info" role="status">{{ flash }}</div>

      <div class="settings-grid" v-if="loaded">
        <label class="ep-field" :class="{ 'ep-has-error': errors.name }">
          <span class="ep-field__label">Name</span>
          <span class="ep-field__hint">Shown across the catalog and in member lists.</span>
          <input
            class="ep-field__input"
            type="text"
            maxlength="50"
            v-model="form.name"
            :disabled="!canEdit || saving.name"
            :aria-invalid="!!errors.name"
            @input="errors.name = ''"
          >
          <span class="ep-field__counter ep-mono">{{ nameLen }} / 50</span>
          <span v-if="errors.name" class="ep-field__error" role="alert">{{ errors.name }}</span>
          <div style="margin-top:var(--space-3);">
            <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm"
              :disabled="!canEdit || saving.name" @click="saveName">
              {{ saving.name ? 'Saving…' : 'Save name' }}
            </button>
          </div>
        </label>

        <label class="ep-field" :class="{ 'ep-has-error': errors.description }">
          <span class="ep-field__label">Description</span>
          <span class="ep-field__hint">Up to 500 characters.</span>
          <textarea
            class="ep-field__textarea"
            maxlength="500"
            rows="3"
            v-model="form.description"
            :disabled="!canEdit || saving.description"
            :aria-invalid="!!errors.description"
            @input="errors.description = ''"
          ></textarea>
          <span class="ep-field__counter ep-mono">{{ descLen }} / 500</span>
          <span v-if="errors.description" class="ep-field__error" role="alert">{{ errors.description }}</span>
          <div style="margin-top:var(--space-3);">
            <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm"
              :disabled="!canEdit || saving.description" @click="saveDescription">
              {{ saving.description ? 'Saving…' : 'Save description' }}
            </button>
          </div>
        </label>

        <div class="ep-field ep-field--toggle">
          <span class="ep-field__label">Visibility</span>
          <span class="ep-field__hint">Flipping to private removes this room from the catalog immediately.</span>
          <div class="ep-toggle" role="radiogroup" aria-label="Visibility">
            <button type="button" class="ep-toggle__option"
              :class="{ 'ep-is-active': form.isPublic }"
              role="radio" :aria-checked="form.isPublic"
              :disabled="!canEdit || saving.visibility"
              @click="setVisibility(true)">Public</button>
            <button type="button" class="ep-toggle__option"
              :class="{ 'ep-is-active': !form.isPublic }"
              role="radio" :aria-checked="!form.isPublic"
              :disabled="!canEdit || saving.visibility"
              @click="setVisibility(false)">Private</button>
          </div>
        </div>

        <div v-if="canEdit" class="settings-danger">
          <h3>Delete this room</h3>
          <p class="ep-body ep-muted">All messages, members, and bans will be removed. Socket.io will broadcast
            <span class="ep-mono">room_deleted</span> to everyone present. This cannot be undone.</p>
          <div>
            <button type="button" class="ep-btn ep-btn--danger" :disabled="saving.deleting" @click="destroy">
              {{ saving.deleting ? 'Deleting…' : 'Delete room permanently' }}
            </button>
          </div>
        </div>

        <p v-else class="ep-body ep-muted">
          Only the room owner can edit these settings or delete the room.
        </p>
      </div>

      <p v-else class="ep-body ep-muted">Loading settings…</p>
    </section>
  `,
})
