<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Spillere</h1>
      <button type="button" class="btn-secondary" @click="downloadBackup">💾 Backup (JSON)</button>
    </div>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">{{ redigerer ? 'Redigér spiller' : 'Ny spiller' }}</h2>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="gem">
        <div class="flex-1 min-w-[10rem]">
          <label class="label">Navn</label>
          <input v-model="form.navn" class="field" required>
        </div>
        <div>
          <label class="label">Farve</label>
          <div class="flex flex-wrap gap-1.5 max-w-[16rem]">
            <button
              v-for="f in SPILLERFARVER" :key="f" type="button"
              class="w-7 h-7 rounded-full border-2 transition-transform"
              :class="form.farve === f ? 'border-stone-800 scale-110' : 'border-transparent'"
              :style="{ backgroundColor: f }"
              @click="form.farve = f"
            ></button>
          </div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn-primary" :disabled="!form.navn.trim() || saving">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
          <button v-if="redigerer" type="button" class="btn-secondary" @click="nulstil">Annullér</button>
        </div>
      </form>
      <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    </section>

    <section>
      <h2 class="section-title">Aktive spillere</h2>
      <p v-if="loading" class="text-stone-500">Henter …</p>
      <p v-else-if="!players.length" class="panel text-stone-500">Ingen spillere endnu.</p>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div v-for="p in players" :key="p.id" class="panel flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full shrink-0" :style="{ backgroundColor: p.farve }"></span>
            <span class="font-semibold">{{ p.navn }}</span>
          </div>
          <div class="flex gap-1">
            <button type="button" class="btn-icon" @click="rediger(p)">✎</button>
            <button type="button" class="btn-icon" title="Skjul (bevarer historik)" @click="skjul(p)">🙈</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { mate500Api, SPILLERFARVER, type Player } from '../api'

const players = ref<Player[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const redigerer = ref<number | null>(null)
const form = reactive({ navn: '', farve: SPILLERFARVER[0] })

async function load() {
  loading.value = true
  try {
    players.value = await mate500Api.players()
  } finally {
    loading.value = false
  }
}

function rediger(p: Player) {
  redigerer.value = p.id
  form.navn = p.navn
  form.farve = p.farve
}

function nulstil() {
  redigerer.value = null
  form.navn = ''
  form.farve = SPILLERFARVER[0]
}

async function gem() {
  saving.value = true
  error.value = ''
  try {
    if (redigerer.value) await mate500Api.updatePlayer(redigerer.value, form.navn, form.farve)
    else await mate500Api.createPlayer(form.navn, form.farve)
    nulstil()
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function skjul(p: Player) {
  if (!confirm(`Skjul ${p.navn}? Historik i tidligere spil bevares.`)) return
  await mate500Api.deletePlayer(p.id)
  await load()
}

async function downloadBackup() {
  const data = await mate500Api.backup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `500mate-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(load)
</script>
