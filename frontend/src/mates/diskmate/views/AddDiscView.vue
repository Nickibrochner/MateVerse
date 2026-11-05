<template>
  <div>
    <div class="form-card">
      <h2>Ny disc</h2>
      <p class="hint">
        Registrér diskene i din taske. Flight-tal, vægt, plastik, tilstand, ejer/taske-status,
        sværhedsgrad, note og billede tilføjer du bagefter i <strong>Diskkartotek</strong>.
      </p>

      <div class="form-row">
        <div class="form-group">
          <label>Navn</label>
          <input v-model="newDisc.name" placeholder="Fx 'Min gule Destroyer'" @keyup.enter="createDisc" />
        </div>
        <div class="form-group">
          <label>Kategori</label>
          <select v-model="newDisc.category">
            <option v-for="c in DISC_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Mærke</label>
          <input v-model="newDisc.brand" placeholder="Fx Innova" />
        </div>
        <div class="form-group">
          <label>Model</label>
          <input v-model="newDisc.mold" placeholder="Fx Destroyer" />
        </div>
      </div>
      <div class="form-group">
        <label>Farve</label>
        <input v-model="newDisc.color" placeholder="Fx Gul" />
      </div>

      <div class="form-actions">
        <button class="btn btn-accent" @click="createDisc">+ Opret disc</button>
      </div>

      <p v-if="message" class="success-msg">{{ message }}</p>
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { invoke, errText } from '../invoke'
import { DISC_CATEGORIES } from '../types'
import type { DiscInput } from '../types'

const message = ref('')
const errorMsg = ref('')

const newDisc = ref({
  name: '',
  brand: '',
  mold: '',
  category: 'Driver',
  color: '',
})

async function createDisc() {
  message.value = ''
  errorMsg.value = ''
  const name = newDisc.value.name.trim()
  if (!name) return
  const input: DiscInput = {
    name,
    brand: newDisc.value.brand.trim() || null,
    mold: newDisc.value.mold.trim() || null,
    category: newDisc.value.category,
    color: newDisc.value.color.trim() || null,
    in_bag: true,
    speed: null,
    glide: null,
    turn: null,
    fade: null,
    weight_grams: null,
    plastic: null,
    condition: null,
    notes: null,
    holder: null,
    lost: false,
    skill_levels: [],
    best_wind: null,
    best_weather: null,
    stability: null,
    acquired_date: null,
  }
  try {
    await invoke('create_disc', { input })
    message.value = `"${name}" blev oprettet — find den under Diskkartotek.`
    newDisc.value = { name: '', brand: '', mold: '', category: 'Driver', color: '' }
  } catch (e) {
    errorMsg.value = errText(e)
  }
}
</script>

<style scoped>
.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.success-msg {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-top: 12px;
  font-size: 13px;
}
</style>
