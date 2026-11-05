<template>
  <div class="disc-detail-panel">
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="section">
      <h4 class="section-title">Fakta om disken</h4>

      <div class="form-row">
        <div class="form-group">
          <label>Navn</label>
          <input v-model="form.name" @change="save" />
        </div>
        <div class="form-group">
          <label>Kategori</label>
          <select v-model="form.category" @change="save">
            <option v-for="c in DISC_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Mærke</label>
          <input v-model="form.brand" @change="save" />
        </div>
        <div class="form-group">
          <label>Model</label>
          <input v-model="form.mold" @change="save" />
        </div>
      </div>
      <div class="form-group">
        <label>Farve</label>
        <input v-model="form.color" @change="save" />
      </div>

      <div class="form-group">
        <label>Billede</label>
        <div class="image-row">
          <img v-if="imageUrl" :src="imageUrl" alt="Billede af disc" class="disc-thumb" />
          <div class="image-actions">
            <button class="btn btn-subtle" :disabled="uploadingImage" @click="pickImage">
              {{ uploadingImage ? 'Uploader…' : (imageUrl ? 'Skift billede' : '+ Tilføj billede') }}
            </button>
            <button v-if="imageUrl" class="btn btn-ghost" @click="removeImage">Fjern billede</button>
          </div>
        </div>
      </div>

      <div class="flight-grid">
        <div class="form-group">
          <label>Speed</label>
          <input type="number" step="0.5" v-model.number="form.speed" @change="save" />
        </div>
        <div class="form-group">
          <label>Glide</label>
          <input type="number" step="0.5" v-model.number="form.glide" @change="save" />
        </div>
        <div class="form-group">
          <label>Turn</label>
          <input type="number" step="0.5" v-model.number="form.turn" @change="save" />
        </div>
        <div class="form-group">
          <label>Fade</label>
          <input type="number" step="0.5" v-model.number="form.fade" @change="save" />
        </div>
        <div class="form-group">
          <label>Vægt (g)</label>
          <input type="number" v-model.number="form.weight_grams" @change="save" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Plastiktype</label>
          <input v-model="form.plastic" placeholder="Fx Champion" @change="save" />
        </div>
        <div class="form-group">
          <label>Disktilstand</label>
          <input v-model="form.condition" list="disc-condition-options" placeholder="Fx Ny (10/10)" @change="save" />
          <datalist id="disc-condition-options">
            <option value="Ny (10/10)" />
            <option value="Let brugt (9/10)" />
            <option value="Lidt brugt (8/10)" />
            <option value="Godt tilspillet (6/10)" />
            <option value="Slidt (4/10)" />
          </datalist>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Stabilitet</label>
          <select v-model="form.stability" @change="save">
            <option :value="null">— Ikke angivet —</option>
            <option v-for="s in DISC_STABILITY" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Anskaffelsesdato</label>
          <input type="date" v-model="form.acquired_date" @change="save" />
        </div>
      </div>
    </div>

    <div class="section">
      <h4 class="section-title">Egnet til / vurdering</h4>

      <div class="level-checkboxes">
        <label v-for="lvl in SKILL_LEVELS" :key="lvl" class="level-checkbox">
          <input type="checkbox" :value="lvl" v-model="form.skill_levels" @change="save" />
          {{ lvl }}
        </label>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Bedst i vind</label>
          <select v-model="form.best_wind" @change="save">
            <option :value="null">— Ikke angivet —</option>
            <option value="Vindstille">Vindstille</option>
            <option value="Let vind">Let vind</option>
            <option value="Frisk vind">Frisk vind</option>
          </select>
        </div>
        <div class="form-group">
          <label>Bedst på bane</label>
          <select v-model="form.best_weather" @change="save">
            <option :value="null">— Ikke angivet —</option>
            <option value="Tør bane">Tør bane</option>
            <option value="Våd/fugtig bane">Våd/fugtig bane</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Note</label>
        <textarea
          v-model="form.notes"
          rows="3"
          placeholder="Fx 'Overstabil approach-disc. God i modvind, til forhåndskast og hårdt venstresving på korte distancer.'"
          @change="save"
        ></textarea>
      </div>
    </div>

    <div class="section">
      <h4 class="section-title">Spiller / ejer / taske</h4>

      <div class="form-group">
        <label>Ejer</label>
        <select v-model="form.holder" @change="save">
          <option :value="null">— Ingen valgt —</option>
          <option v-for="p in players" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>

      <div class="checkbox-row">
        <label class="checkbox-inline">
          <input type="checkbox" v-model="form.in_bag" @change="save" />
          I tasken
        </label>
        <label class="checkbox-inline">
          <input type="checkbox" v-model="form.lost" @change="save" />
          Forsvundet
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke, pickFile, readAsDataUrl, errText } from '../invoke'
import { SKILL_LEVELS, DISC_CATEGORIES, DISC_STABILITY } from '../types'
import type { Disc, DiscInput } from '../types'

const props = defineProps<{ disc: Disc; players: string[] }>()

const errorMsg = ref('')
const imageUrl = ref<string | null>(null)
const uploadingImage = ref(false)

const form = ref({
  name: props.disc.name,
  brand: props.disc.brand ?? '',
  mold: props.disc.mold ?? '',
  category: props.disc.category,
  color: props.disc.color ?? '',
  in_bag: props.disc.in_bag,
  speed: props.disc.speed,
  glide: props.disc.glide,
  turn: props.disc.turn,
  fade: props.disc.fade,
  weight_grams: props.disc.weight_grams,
  plastic: props.disc.plastic ?? '',
  condition: props.disc.condition ?? '',
  notes: props.disc.notes ?? '',
  holder: props.disc.holder,
  lost: props.disc.lost,
  skill_levels: [...props.disc.skill_levels],
  best_wind: props.disc.best_wind,
  best_weather: props.disc.best_weather,
  stability: props.disc.stability,
  acquired_date: props.disc.acquired_date ?? '',
})

async function loadImage() {
  try {
    imageUrl.value = await invoke<string | null>('get_disc_image_data_url', { discId: props.disc.id })
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

onMounted(loadImage)

async function save() {
  errorMsg.value = ''
  const name = form.value.name.trim()
  if (!name) {
    errorMsg.value = 'Navnet må ikke være tomt'
    return
  }
  const input: DiscInput = {
    name,
    brand: form.value.brand.trim() || null,
    mold: form.value.mold.trim() || null,
    category: form.value.category,
    color: form.value.color.trim() || null,
    in_bag: form.value.in_bag,
    speed: form.value.speed,
    glide: form.value.glide,
    turn: form.value.turn,
    fade: form.value.fade,
    weight_grams: form.value.weight_grams,
    plastic: form.value.plastic.trim() || null,
    condition: form.value.condition.trim() || null,
    notes: form.value.notes.trim() || null,
    holder: form.value.holder,
    lost: form.value.lost,
    skill_levels: form.value.skill_levels,
    best_wind: form.value.best_wind,
    best_weather: form.value.best_weather,
    stability: form.value.stability,
    acquired_date: form.value.acquired_date || null,
  }
  try {
    await invoke('update_disc', { discId: props.disc.id, input })
    // Synkronisér tilbage til disc-objektet fra forældrens liste. Uden dette
    // ser det ud som om intet blev gemt, hvis panelet lukkes og åbnes igen:
    // "form" genindlæses fra props.disc, som ellers ville stå med de gamle
    // (ugemte) værdier, selvom databasen faktisk blev opdateret korrekt.
    props.disc.name = name
    props.disc.brand = input.brand
    props.disc.mold = input.mold
    props.disc.category = input.category
    props.disc.color = input.color
    props.disc.in_bag = input.in_bag
    props.disc.speed = form.value.speed
    props.disc.glide = form.value.glide
    props.disc.turn = form.value.turn
    props.disc.fade = form.value.fade
    props.disc.weight_grams = form.value.weight_grams
    props.disc.plastic = input.plastic
    props.disc.condition = input.condition
    props.disc.notes = input.notes
    props.disc.holder = input.holder
    props.disc.lost = input.lost
    props.disc.skill_levels = [...input.skill_levels]
    props.disc.best_wind = input.best_wind
    props.disc.best_weather = input.best_weather
    props.disc.stability = input.stability
    props.disc.acquired_date = input.acquired_date
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
    await invoke('set_disc_image', { discId: props.disc.id, image: await readAsDataUrl(file) })
    await loadImage()
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    uploadingImage.value = false
  }
}

async function removeImage() {
  try {
    await invoke('remove_disc_image', { discId: props.disc.id })
    imageUrl.value = null
  } catch (e) {
    errorMsg.value = errText(e)
  }
}
</script>

<style scoped>
.disc-detail-panel {
  padding: 12px 4px;
  max-width: 640px;
}

.section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.section:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.flight-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group { margin-top: 10px; }
.flight-grid .form-group { margin-top: 0; }
.form-row .form-group:first-child { margin-top: 10px; }

.checkbox-row {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.level-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 6px;
}

.level-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

select,
input:not([type='checkbox']),
textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
}

textarea {
  font-family: inherit;
  resize: vertical;
}

.image-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.disc-thumb {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.image-actions {
  display: flex;
  gap: 8px;
}
</style>
