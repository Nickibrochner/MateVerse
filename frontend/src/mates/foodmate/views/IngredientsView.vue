<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Ingredienser</h1>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">{{ redigerer ? `Redigér: ${form.navn}` : 'Ny ingrediens' }}</h2>

      <div class="flex gap-2">
        <input v-model="offQuery" class="field" placeholder="Søg på Open Food Facts for at udfylde automatisk …" @keyup.enter="soegOff">
        <button type="button" class="btn-secondary shrink-0" :disabled="!offQuery.trim() || offSoeger" @click="soegOff">
          {{ offSoeger ? 'Søger …' : '🔍 Søg' }}
        </button>
      </div>
      <div v-if="offTraeffere.length" class="max-h-40 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
        <button
          v-for="(t, i) in offTraeffere" :key="i" type="button"
          class="w-full text-left px-3 py-2 text-sm hover:bg-stone-50"
          @click="brugOffTraeffer(t)"
        >{{ t.navn }} <span class="text-stone-400">· {{ t.naering.energi_kcal ?? '–' }} kcal/100g</span></button>
      </div>

      <div>
        <label class="label">Navn</label>
        <input v-model="form.navn" class="field" required>
      </div>
      <p class="text-xs text-stone-400">Alle næringsværdier er pr. 100 g.</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div v-for="(label, key) in NUTRIENT_LABELS" :key="key">
          <label class="label">{{ label }}</label>
          <input v-model.number="form[key]" type="number" step="0.1" min="0" class="field">
        </div>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-primary" :disabled="!form.navn.trim() || saving" @click="gem">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
        <button v-if="redigerer" type="button" class="btn-secondary" @click="nulstil">Annullér</button>
      </div>
      <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    </section>

    <section>
      <div class="flex items-center justify-between mb-2">
        <h2 class="section-title !mb-0">Alle ingredienser</h2>
        <input v-model="search" class="field !w-56" placeholder="Søg …" @input="debouncedLoad">
      </div>
      <div class="panel !p-0 overflow-x-auto">
        <table class="table">
          <thead><tr><th>Navn</th><th class="num">Kcal</th><th class="num">Protein</th><th class="num">Kulhydrat</th><th class="num">Fedt</th><th></th></tr></thead>
          <tbody>
            <tr v-for="i in ingredients" :key="i.id">
              <td>{{ i.navn }}</td>
              <td class="num">{{ i.energi_kcal ?? '–' }}</td>
              <td class="num">{{ i.protein ?? '–' }}</td>
              <td class="num">{{ i.kulhydrat ?? '–' }}</td>
              <td class="num">{{ i.fedt ?? '–' }}</td>
              <td class="flex gap-1 justify-end">
                <button type="button" class="btn-icon" @click="rediger(i)">✎</button>
                <button type="button" class="btn-icon" @click="slet(i)">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!ingredients.length" class="p-5 text-stone-500">Ingen ingredienser endnu.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { foodmateApi, NUTRIENT_LABELS, type Ingredient, type OffTraeffer } from '../api'

const ingredients = ref<Ingredient[]>([])
const search = ref('')
const redigerer = ref<number | null>(null)
const saving = ref(false)
const error = ref('')

const blankForm = () => ({
  navn: '', energi_kcal: null, protein: null, kulhydrat: null, fedt: null,
  kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null,
} as { navn: string } & Record<keyof typeof NUTRIENT_LABELS, number | null>)
const form = reactive(blankForm())

const offQuery = ref('')
const offSoeger = ref(false)
const offTraeffere = ref<OffTraeffer[]>([])

async function load() {
  ingredients.value = await foodmateApi.ingredients(search.value || undefined)
}
let debounceTimer: ReturnType<typeof setTimeout> | undefined
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 250)
}

function rediger(i: Ingredient) {
  redigerer.value = i.id
  Object.assign(form, i)
}
function nulstil() {
  redigerer.value = null
  Object.assign(form, blankForm())
  offTraeffere.value = []
  offQuery.value = ''
}

async function gem() {
  saving.value = true
  error.value = ''
  try {
    if (redigerer.value) await foodmateApi.updateIngredient(redigerer.value, form)
    else await foodmateApi.createIngredient(form)
    nulstil()
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function slet(i: Ingredient) {
  if (!confirm(`Flyt ${i.navn} til papirkurven?`)) return
  await foodmateApi.deleteIngredient(i.id)
  await load()
}

async function soegOff() {
  if (!offQuery.value.trim()) return
  offSoeger.value = true
  try {
    offTraeffere.value = await foodmateApi.searchOpenFoodFacts(offQuery.value.trim())
  } finally {
    offSoeger.value = false
  }
}

function brugOffTraeffer(t: OffTraeffer) {
  form.navn = t.navn
  Object.assign(form, t.naering)
  offTraeffere.value = []
}

onMounted(load)
</script>
