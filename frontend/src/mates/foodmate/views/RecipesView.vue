<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Opskrifter</h1>
      <button type="button" class="btn-primary" @click="visNyOpskrift = !visNyOpskrift">{{ visNyOpskrift ? 'Luk' : '+ Ny opskrift' }}</button>
    </div>

    <section v-if="visNyOpskrift" class="panel space-y-3">
      <h2 class="section-title !mb-0">Ny opskrift</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2"><label class="label">Titel</label><input v-model="nyOpskrift.titel" class="field" required></div>
        <div><label class="label">Tilberedningstid (min)</label><input v-model.number="nyOpskrift.tilberedningstid" type="number" min="0" class="field"></div>
        <div><label class="label">Portioner</label><input v-model.number="nyOpskrift.portioner" type="number" min="1" class="field"></div>
        <div class="sm:col-span-2"><label class="label">Tags (kommasepareret)</label><input v-model="nyOpskrift.tags" class="field" placeholder="aftensmad, vegetar"></div>
      </div>
      <div><label class="label">Beskrivelse</label><textarea v-model="nyOpskrift.beskrivelse" class="field" rows="2"></textarea></div>
      <div class="flex justify-end">
        <button type="button" class="btn-primary" :disabled="!nyOpskrift.titel.trim() || opretter" @click="opret">{{ opretter ? 'Opretter …' : 'Opret' }}</button>
      </div>
      <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    </section>

    <div class="flex flex-wrap gap-3 items-center">
      <input v-model="search" class="field flex-1 min-w-[12rem]" placeholder="Søg opskrifter …" @input="debouncedLoad">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="t in tags" :key="t" type="button"
          class="tag"
          :class="activeTag === t ? 'bg-accent text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
          @click="toggleTag(t)"
        >{{ t }}</button>
      </div>
    </div>

    <p v-if="loading" class="text-stone-500">Henter …</p>
    <p v-else-if="!recipes.length" class="panel text-stone-500">Ingen opskrifter fundet.</p>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <button v-for="r in recipes" :key="r.id" type="button" class="panel text-left hover:border-accent transition-colors" @click="openId = r.id">
        <p class="font-semibold">{{ r.titel }}</p>
        <p class="text-xs text-stone-500 mt-1">
          {{ r.portioner }} {{ r.portioner === 1 ? 'portion' : 'portioner' }}
          <span v-if="r.tilberedningstid"> · ⏱ {{ r.tilberedningstid }} min</span>
        </p>
        <p v-if="r.naering_pr_100g.energi_kcal != null" class="text-xs text-stone-400 mt-1">{{ Math.round(r.naering_pr_100g.energi_kcal) }} kcal / 100 g</p>
        <div class="flex flex-wrap gap-1 mt-2">
          <span v-for="t in (r.tags ?? '').split(',').map(x => x.trim()).filter(Boolean)" :key="t" class="tag bg-stone-100 text-stone-500 !text-[10px]">{{ t }}</span>
        </div>
      </button>
    </div>

    <RecipeDetailModal v-if="openId" :recipe-id="openId" @close="openId = null" @changed="load" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { foodmateApi, type RecipeSummary } from '../api'
import RecipeDetailModal from '../components/RecipeDetailModal.vue'

const recipes = ref<RecipeSummary[]>([])
const tags = ref<string[]>([])
const search = ref('')
const activeTag = ref<string | null>(null)
const loading = ref(false)
const openId = ref<number | null>(null)

const visNyOpskrift = ref(false)
const opretter = ref(false)
const error = ref('')
const nyOpskrift = reactive({ titel: '', beskrivelse: '', tilberedningstid: null as number | null, portioner: 4, tags: '' })

async function load() {
  loading.value = true
  try {
    const [r, t] = await Promise.all([foodmateApi.recipes(search.value || undefined, activeTag.value || undefined), foodmateApi.tags()])
    recipes.value = r
    tags.value = t
  } finally {
    loading.value = false
  }
}
let debounceTimer: ReturnType<typeof setTimeout> | undefined
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 250)
}
function toggleTag(t: string) {
  activeTag.value = activeTag.value === t ? null : t
  load()
}

async function opret() {
  opretter.value = true
  error.value = ''
  try {
    const r = await foodmateApi.createRecipe(nyOpskrift)
    nyOpskrift.titel = ''
    nyOpskrift.beskrivelse = ''
    nyOpskrift.tilberedningstid = null
    nyOpskrift.portioner = 4
    nyOpskrift.tags = ''
    visNyOpskrift.value = false
    await load()
    openId.value = r.id
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    opretter.value = false
  }
}

onMounted(load)
</script>
