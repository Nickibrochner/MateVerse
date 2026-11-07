<template>
  <div class="caddie-note-panel">
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading" class="empty-state">Indlæser…</p>

    <template v-else>
      <div class="form-grid">
        <div class="form-group">
          <label>Par</label>
          <input type="number" min="2" max="7" v-model.number="form.par" @change="save" />
        </div>
        <div class="form-group">
          <label>Længde (meter)</label>
          <input type="number" min="0" v-model.number="form.length_meters" @change="save" />
        </div>
        <div class="form-group">
          <label>Højdeforskel (meter)</label>
          <input
            type="number"
            v-model.number="form.elevation_meters"
            placeholder="+op ad bakke / -ned ad bakke"
            @change="save"
          />
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" v-model="form.elevated_basket" @change="save" />
            Ophøjet kurv (Elevated Basket)
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Fairway-type / Træ-tæthed</label>
          <input
            v-model="form.fairway_type"
            list="fairway-type-options"
            placeholder="Fx Semiskov"
            @change="save"
          />
          <datalist id="fairway-type-options">
            <option value="Træ-tunnel" />
            <option value="Skov / Tight Wooded" />
            <option value="Trælinje venstre" />
            <option value="Trælinje højre" />
            <option value="Semiskov" />
            <option value="Åbent" />
          </datalist>
        </div>
        <div class="form-group">
          <label>Kastelinje &amp; Shape</label>
          <input
            v-model="form.throw_shape"
            list="throw-shape-options"
            placeholder="Fx Fade-højre"
            @change="save"
          />
          <datalist id="throw-shape-options">
            <option value="Lige ud" />
            <option value="Fade-højre" />
            <option value="Fade-venstre" />
            <option value="S-kurve / Flex" />
          </datalist>
        </div>
        <div class="form-group">
          <label>Underlag omkring kurven</label>
          <input
            v-model="form.ground_surface"
            list="ground-surface-options"
            placeholder="Fx Skovbund"
            @change="save"
          />
          <datalist id="ground-surface-options">
            <option value="Græs" />
            <option value="Skovbund" />
            <option value="Jord" />
          </datalist>
        </div>
      </div>

      <div class="form-group">
        <label>Forhindringer / OB</label>
        <textarea
          v-model="form.hazards"
          rows="2"
          placeholder="Fx 'OB langs højre side fra 60m og ind. Vandhazard bag kurven.'"
          @change="save"
        ></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Anbefalet kasteform</label>
          <input v-model="form.recommended_throw" placeholder="Fx 'Backhand hyzer, lav flugt'" @change="save" />
        </div>
        <div class="form-group">
          <label>Anbefalet disc</label>
          <input v-model="form.recommended_disc" placeholder="Fx 'Overstabil driver'" @change="save" />
        </div>
      </div>

      <div class="form-group">
        <label>Personlige noter</label>
        <textarea
          v-model="form.notes"
          rows="3"
          placeholder="Fx 'Snævert landingsområde — spil sikkert til midten frem for at presse kurven.'"
          @change="save"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Billede</label>
        <div class="image-row">
          <img v-if="imageUrl" :src="imageUrl" alt="Billede af hullet" class="caddie-thumb" />
          <div class="image-actions">
            <button class="btn btn-subtle" :disabled="uploadingImage" @click="pickImage">
              {{ uploadingImage ? 'Uploader…' : (imageUrl ? 'Skift billede' : '+ Tilføj billede') }}
            </button>
            <button v-if="imageUrl" class="btn btn-ghost" @click="removeImage">Fjern billede</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { invoke, pickFile, readAsDataUrl, errText } from '../invoke'
import type { CaddieNote, CaddieNoteInput, TeeColor } from '../types'

const props = defineProps<{ courseHoleId: number; teeColor: TeeColor }>()

const errorMsg = ref('')
const loading = ref(false)
const imageUrl = ref<string | null>(null)
const uploadingImage = ref(false)

function emptyForm() {
  return {
    par: null as number | null,
    length_meters: null as number | null,
    elevation_meters: null as number | null,
    elevated_basket: false,
    fairway_type: '',
    throw_shape: '',
    ground_surface: '',
    hazards: '',
    recommended_throw: '',
    recommended_disc: '',
    notes: '',
  }
}

const form = ref(emptyForm())

async function loadNote() {
  loading.value = true
  errorMsg.value = ''
  try {
    const note = await invoke<CaddieNote | null>('get_caddie_note', {
      courseHoleId: props.courseHoleId,
      teeColor: props.teeColor,
    })
    form.value = note
      ? {
          par: note.par,
          length_meters: note.length_meters,
          elevation_meters: note.elevation_meters,
          elevated_basket: note.elevated_basket,
          fairway_type: note.fairway_type ?? '',
          throw_shape: note.throw_shape ?? '',
          ground_surface: note.ground_surface ?? '',
          hazards: note.hazards ?? '',
          recommended_throw: note.recommended_throw ?? '',
          recommended_disc: note.recommended_disc ?? '',
          notes: note.notes ?? '',
        }
      : emptyForm()
    imageUrl.value = await invoke<string | null>('get_caddie_image_data_url', {
      courseHoleId: props.courseHoleId,
      teeColor: props.teeColor,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(loadNote)
watch(() => [props.courseHoleId, props.teeColor], loadNote)

async function save() {
  errorMsg.value = ''
  const input: CaddieNoteInput = {
    par: form.value.par,
    length_meters: form.value.length_meters,
    elevation_meters: form.value.elevation_meters,
    elevated_basket: form.value.elevated_basket,
    fairway_type: form.value.fairway_type.trim() || null,
    throw_shape: form.value.throw_shape.trim() || null,
    ground_surface: form.value.ground_surface.trim() || null,
    hazards: form.value.hazards.trim() || null,
    recommended_throw: form.value.recommended_throw.trim() || null,
    recommended_disc: form.value.recommended_disc.trim() || null,
    notes: form.value.notes.trim() || null,
  }
  try {
    await invoke('save_caddie_note', { courseHoleId: props.courseHoleId, teeColor: props.teeColor, input })
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function pickImage() {
  errorMsg.value = ''
  const file = await pickFile('image/png,image/jpeg,image/gif,image/webp,image/bmp')
  if (!file) return

  uploadingImage.value = true
  try {
    await invoke('set_caddie_image', { courseHoleId: props.courseHoleId, teeColor: props.teeColor, image: await readAsDataUrl(file) })
    imageUrl.value = await invoke<string | null>('get_caddie_image_data_url', {
      courseHoleId: props.courseHoleId,
      teeColor: props.teeColor,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    uploadingImage.value = false
  }
}

async function removeImage() {
  try {
    await invoke('remove_caddie_image', { courseHoleId: props.courseHoleId, teeColor: props.teeColor })
    imageUrl.value = null
  } catch (e) {
    errorMsg.value = errText(e)
  }
}
</script>

<style scoped>
.caddie-note-panel {
  padding: 12px 4px;
  max-width: 680px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-top: 10px;
}

.form-group { margin-top: 10px; }
.form-grid .form-group { margin-top: 10px; }

.checkbox-group {
  display: flex;
  align-items: flex-end;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  font-size: 13px;
}

.checkbox-group input[type='checkbox'] {
  width: auto;
}

textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.image-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.caddie-thumb {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.image-actions {
  display: flex;
  gap: 8px;
}
</style>
