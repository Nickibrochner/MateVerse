<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-2xl font-bold">Dagbog</h1>
      <div class="flex items-center gap-2">
        <button type="button" class="btn-icon" @click="skiftDato(-1)">←</button>
        <input v-model="dato" type="date" class="field !w-40">
        <button type="button" class="btn-icon" @click="skiftDato(1)">→</button>
        <button v-if="dato !== idag" type="button" class="text-xs text-accent" @click="dato = idag">i dag</button>
      </div>
    </div>

    <div class="panel !p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
      <div v-for="(label, key) in NUTRIENT_LABELS" :key="key">
        <div class="text-xs text-stone-400">{{ label }}</div>
        <div class="font-semibold">{{ total[key] ?? '–' }}</div>
      </div>
    </div>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">Tilføj</h2>
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex-1 min-w-[12rem]">
          <label class="label">Opskrift</label>
          <select v-model.number="nyRecipeId" class="field">
            <option :value="null">Vælg opskrift …</option>
            <option v-for="r in recipes" :key="r.id" :value="r.id">{{ r.titel }}</option>
          </select>
        </div>
        <div>
          <label class="label">Gram</label>
          <input v-model.number="nyGram" type="number" min="1" class="field !w-24" placeholder="g">
        </div>
        <button type="button" class="btn-primary" :disabled="!nyRecipeId || !nyGram || tilfoejer" @click="tilfoej">
          {{ tilfoejer ? 'Gemmer …' : 'Tilføj' }}
        </button>
      </div>
      <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    </section>

    <p v-if="loading" class="text-stone-500">Henter …</p>
    <p v-else-if="!entries.length" class="panel text-stone-500">Intet logget denne dag.</p>
    <div v-else class="panel !p-0 overflow-x-auto">
      <table class="table">
        <thead><tr><th>Opskrift</th><th class="num">Gram</th><th class="num">Kcal</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td>{{ e.recipe_titel }}</td>
            <td class="num">{{ formatGram(e.gram) }} g</td>
            <td class="num">{{ e.naering.energi_kcal != null ? Math.round(e.naering.energi_kcal) : '–' }}</td>
            <td><button type="button" class="btn-icon" @click="slet(e.id)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { today } from '../../../lib/format'
import { foodmateApi, NUTRIENT_LABELS, type LogEntry, type Nutrients, type RecipeSummary } from '../api'

const idag = today()
const dato = ref(idag)
const entries = ref<LogEntry[]>([])
const total = ref<Nutrients>({} as Nutrients)
const recipes = ref<RecipeSummary[]>([])
const loading = ref(false)
const error = ref('')

const nyRecipeId = ref<number | null>(null)
const nyGram = ref<number | null>(null)
const tilfoejer = ref(false)

function formatGram(g: number) {
  return g.toLocaleString('da-DK', { maximumFractionDigits: 0 })
}

function skiftDato(delta: number) {
  const d = new Date(dato.value)
  d.setDate(d.getDate() + delta)
  dato.value = d.toISOString().slice(0, 10)
}

async function load() {
  loading.value = true
  try {
    const r = await foodmateApi.log(dato.value)
    entries.value = r.entries
    total.value = r.total
  } finally {
    loading.value = false
  }
}

async function tilfoej() {
  if (!nyRecipeId.value || !nyGram.value) return
  tilfoejer.value = true
  error.value = ''
  try {
    await foodmateApi.addLogEntry(nyRecipeId.value, dato.value, nyGram.value)
    nyRecipeId.value = null
    nyGram.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    tilfoejer.value = false
  }
}

async function slet(id: number) {
  await foodmateApi.deleteLogEntry(id)
  await load()
}

watch(dato, load)
onMounted(async () => {
  recipes.value = await foodmateApi.recipes()
  await load()
})
</script>
