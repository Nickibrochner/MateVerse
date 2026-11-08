<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Papirkurv</h1>
      <button v-if="items.length" type="button" class="btn-secondary !text-loss" @click="tomPapirkurv">Tøm papirkurv</button>
    </div>
    <p v-if="besked" class="panel text-sm">{{ besked }}</p>

    <p v-if="loading" class="text-stone-500">Henter …</p>
    <p v-else-if="!items.length" class="panel text-stone-500">Papirkurven er tom.</p>
    <div v-else class="panel !p-0 overflow-x-auto">
      <table class="table">
        <thead><tr><th>Type</th><th>Navn</th><th></th></tr></thead>
        <tbody>
          <tr v-for="i in items" :key="`${i.type}-${i.id}`">
            <td>{{ i.type === 'ingredient' ? '🥕 Ingrediens' : '📖 Opskrift' }}</td>
            <td>{{ i.navn }}</td>
            <td class="flex gap-2 justify-end">
              <button type="button" class="btn-secondary !text-xs" @click="gendan(i)">Gendan</button>
              <button type="button" class="btn-secondary !text-xs !text-loss" @click="sletPermanent(i)">Slet permanent</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { foodmateApi, type TrashItem } from '../api'

const items = ref<TrashItem[]>([])
const loading = ref(false)
const besked = ref('')

async function load() {
  loading.value = true
  try {
    items.value = await foodmateApi.trash()
  } finally {
    loading.value = false
  }
}

async function gendan(i: TrashItem) {
  await foodmateApi.restoreTrash(i.type, i.id)
  await load()
}

async function sletPermanent(i: TrashItem) {
  if (!confirm(`Slet ${i.navn} permanent? Kan ikke fortrydes.`)) return
  try {
    await foodmateApi.deleteTrashPermanently(i.type, i.id)
    await load()
  } catch (e) {
    besked.value = (e as Error).message
  }
}

async function tomPapirkurv() {
  if (!confirm('Slet alt i papirkurven permanent? Kan ikke fortrydes.')) return
  const resultat = await foodmateApi.emptyTrash()
  besked.value = resultat.fejlede
    ? `${resultat.slettet} slettet · ${resultat.fejlede} kunne ikke slettes (stadig i brug i en opskrift).`
    : `${resultat.slettet} slettet permanent.`
  await load()
}

onMounted(load)
</script>
