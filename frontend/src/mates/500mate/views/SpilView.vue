<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Spil</h1>
      <button type="button" class="btn-primary" @click="visNytSpil = !visNytSpil">{{ visNytSpil ? 'Luk' : '+ Nyt spil' }}</button>
    </div>

    <section v-if="visNytSpil" class="panel space-y-3">
      <h2 class="section-title !mb-0">Nyt spil</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="label">Navn (valgfrit)</label>
          <input v-model="nytSpil.navn" class="field" placeholder="Fredagsspil">
        </div>
        <div>
          <label class="label">Dato</label>
          <input v-model="nytSpil.dato" type="date" class="field">
        </div>
      </div>
      <div>
        <label class="label">Spillere (mindst 3)</label>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="p in players" :key="p.id"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-sm"
            :class="nytSpil.spillerIds.includes(p.id) ? 'border-accent bg-accent-soft' : 'border-stone-300'"
          >
            <input v-model="nytSpil.spillerIds" type="checkbox" :value="p.id" class="sr-only">
            <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: p.farve }"></span>
            {{ p.navn }}
          </label>
        </div>
      </div>
      <div class="flex justify-end">
        <button type="button" class="btn-primary" :disabled="nytSpil.spillerIds.length < 3 || opretter" @click="opretSpil">
          {{ opretter ? 'Opretter …' : 'Opret og start' }}
        </button>
      </div>
      <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    </section>

    <section>
      <h2 class="section-title">Igangværende</h2>
      <p v-if="!igangvaerende.length" class="panel text-stone-500">Ingen igangværende spil.</p>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <router-link v-for="g in igangvaerende" :key="g.id" :to="`/500mate/spil/${g.id}`" class="panel hover:border-accent transition-colors">
          <div class="font-semibold">{{ g.navn || `Spil #${g.id}` }}</div>
          <div class="text-xs text-stone-500 mt-1">{{ g.dato }} · {{ g.spillere.map(s => s.navn).join(', ') }}</div>
        </router-link>
      </div>
    </section>

    <section>
      <h2 class="section-title">Afsluttede</h2>
      <p v-if="!afsluttede.length" class="panel text-stone-500">Ingen afsluttede spil endnu.</p>
      <div v-else class="panel !p-0 overflow-x-auto">
        <table class="table">
          <thead><tr><th>Dato</th><th>Navn</th><th>Vinder</th><th>Spillere</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in afsluttede" :key="g.id">
              <td class="text-stone-500">{{ g.dato }}</td>
              <td><router-link :to="`/500mate/spil/${g.id}`" class="hover:text-accent">{{ g.navn || `Spil #${g.id}` }}</router-link></td>
              <td><span v-if="vinderNavn(g)" class="tag bg-accent/10 text-accent">🏆 {{ vinderNavn(g) }}</span></td>
              <td class="text-stone-500 text-xs">{{ g.spillere.map(s => s.navn).join(', ') }}</td>
              <td><button type="button" class="btn-icon" @click="sletSpil(g.id)">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { mate500Api, type GameWithPlayers, type Player } from '../api'

const players = ref<Player[]>([])
const games = ref<GameWithPlayers[]>([])
const visNytSpil = ref(false)
const opretter = ref(false)
const error = ref('')
const nytSpil = reactive({ navn: '', dato: new Date().toISOString().slice(0, 10), spillerIds: [] as number[] })

const igangvaerende = computed(() => games.value.filter(g => !g.afsluttet))
const afsluttede = computed(() => games.value.filter(g => g.afsluttet))

function vinderNavn(g: GameWithPlayers) {
  return g.spillere.find(s => s.id === g.vinder_id)?.navn
}

async function load() {
  const [p, g] = await Promise.all([mate500Api.players(), mate500Api.games()])
  players.value = p
  games.value = g
}

async function opretSpil() {
  opretter.value = true
  error.value = ''
  try {
    await mate500Api.createGame(nytSpil.navn || undefined, nytSpil.dato, nytSpil.spillerIds)
    nytSpil.navn = ''
    nytSpil.spillerIds = []
    visNytSpil.value = false
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    opretter.value = false
  }
}

async function sletSpil(id: number) {
  if (!confirm('Slet dette spil og alle dets runder? Kan ikke fortrydes.')) return
  await mate500Api.deleteGame(id)
  await load()
}

onMounted(load)
</script>
