<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <router-link to="/500mate" class="text-sm text-stone-500 hover:text-accent">← Tilbage til Spil</router-link>
        <h1 class="text-2xl font-bold mt-1">{{ game?.navn || `Spil #${gameId}` }}</h1>
        <p v-if="game" class="text-sm text-stone-500">{{ game.dato }} · {{ game.spillere.length }} spillere</p>
      </div>
      <button v-if="game && !game.afsluttet" type="button" class="btn-primary" :disabled="afslutter" @click="afslutSpil">
        {{ afslutter ? '…' : '🏁 Afslut spil' }}
      </button>
      <span v-else-if="game?.afsluttet" class="tag bg-accent/10 text-accent">Afsluttet</span>
    </div>

    <p v-if="error" class="text-loss text-sm">{{ error }}</p>

    <template v-if="game">
      <section class="panel">
        <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-4">
          <div v-for="s in scoreboard" :key="s.player_id" class="min-w-[6rem]">
            <div class="text-xs text-stone-500 flex items-center gap-1">
              <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: s.farve }"></span>
              {{ s.navn }}
              <span v-if="s.er_foerer">🏆</span>
            </div>
            <div class="font-display text-xl font-bold tabular-nums">{{ s.total }}</div>
          </div>
        </div>
        <p v-if="!game.afsluttet" class="text-xs text-stone-400 mt-3">Giver denne runde: <strong>{{ dealer?.navn }}</strong></p>
      </section>

      <section v-if="rounds.length">
        <h2 class="section-title">Runder</h2>
        <div class="panel !p-0 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>#</th><th>Melding</th>
                <th v-for="s in game.spillere" :key="s.id">{{ s.navn }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rounds" :key="r.id">
                <td class="text-stone-400">{{ r.runde_nr }}</td>
                <td>
                  <span v-if="r.melding_farve" class="tag bg-stone-100 text-stone-600">
                    {{ melderNavn(r) }} · {{ farveNavn(r.melding_farve) }}{{ r.melding_antal ? ` ${r.melding_antal}` : '' }}
                  </span>
                  <span v-else class="text-stone-400 text-xs">Ingen melding</span>
                </td>
                <td v-for="s in game.spillere" :key="s.id" class="num" :class="pointKlasse(r, s.id)">
                  {{ r.points.find(p => p.player_id === s.id)?.point ?? '–' }}
                  <span class="text-stone-400 text-xs">({{ r.points.find(p => p.player_id === s.id)?.stik_vundet ?? 0 }})</span>
                </td>
                <td><button type="button" class="btn-icon" @click="sletRunde(r.id)">✕</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="!game.afsluttet" class="panel space-y-4">
        <h2 class="section-title !mb-0">Ny runde</h2>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="label">Melder</label>
            <select v-model="meldingSpillerId" class="field">
              <option :value="null">— ingen melding —</option>
              <option v-for="s in game.spillere" :key="s.id" :value="s.id">{{ s.navn }}</option>
            </select>
          </div>
          <div>
            <label class="label">Farve</label>
            <select v-model="meldingFarve" class="field" :disabled="meldingSpillerId === null">
              <option :value="null">Vælg farve …</option>
              <option v-for="f in FARVER" :key="f.id" :value="f.id">{{ f.navn }}</option>
            </select>
          </div>
          <div>
            <label class="label">Antal</label>
            <select v-model.number="meldingAntal" class="field" :disabled="meldingSpillerId === null || meldingFarve === 'nullo' || !meldingFarve">
              <option :value="null">—</option>
              <option v-for="n in [6, 7, 8, 9, 10]" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="s in game.spillere" :key="s.id" class="flex flex-wrap items-center gap-2">
            <span class="w-24 shrink-0 text-sm font-medium flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: s.farve }"></span>{{ s.navn }}
            </span>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="n in 11" :key="n - 1" type="button"
                class="w-7 h-7 rounded text-xs font-semibold border"
                :class="stik[s.id] === n - 1 ? 'bg-accent text-white border-accent' : 'border-stone-300 text-stone-600 hover:border-accent'"
                @click="stik[s.id] = n - 1"
              >{{ n - 1 }}</button>
            </div>
            <span class="text-xs text-stone-400 tabular-nums">{{ livePoint(s.id) }} point</span>
          </div>
          <p class="text-xs" :class="stikSum === 10 ? 'text-stone-400' : 'text-loss'">Stik fordelt: {{ stikSum }} / 10</p>
        </div>

        <div class="flex justify-between items-center">
          <button type="button" class="btn-secondary !text-xs" :disabled="!rounds.length" @click="fortrydSeneste">↩ Fortryd seneste runde</button>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" @click="nulstilForm">Nulstil</button>
            <button type="button" class="btn-primary" :disabled="stikSum !== 10 || gemmer" @click="gemRunde">{{ gemmer ? 'Gemmer …' : 'Gem runde' }}</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 class="section-title !mb-0">Noter</h2>
        <textarea v-model="notat" class="field mt-2" rows="2" placeholder="Husregler, aftaler mv." @blur="gemNotat"></textarea>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { FARVER, mate500Api, type GameWithPlayers, type RoundWithPoints, type RundeTotal } from '../api'
import { gainClass } from '../../../lib/format'

const route = useRoute()
const gameId = Number(route.params.id)

const game = ref<GameWithPlayers | null>(null)
const rounds = ref<RoundWithPoints[]>([])
const totaler = ref<RundeTotal[]>([])
const error = ref('')
const afslutter = ref(false)
const gemmer = ref(false)
const notat = ref('')

const meldingSpillerId = ref<number | null>(null)
const meldingFarve = ref<string | null>(null)
const meldingAntal = ref<number | null>(null)
const stik = reactive<Record<number, number>>({})

const stikSum = computed(() => Object.values(stik).reduce((a, b) => a + b, 0))

const dealer = computed(() => {
  if (!game.value || !game.value.spillere.length) return null
  return game.value.spillere[rounds.value.length % game.value.spillere.length]
})

const scoreboard = computed(() => {
  if (!game.value) return []
  const sidste = totaler.value.at(-1)
  const totals = game.value.spillere.map(s => ({
    player_id: s.id,
    navn: s.navn,
    farve: s.farve,
    total: sidste?.totaler.find(t => t.player_id === s.id)?.kumulativt ?? 0,
  }))
  const maks = Math.max(...totals.map(t => t.total))
  return totals.sort((a, b) => b.total - a.total).map(t => ({ ...t, er_foerer: t.total === maks && rounds.value.length > 0 }))
})

const KONTRAKT_BASE: Record<string, number> = { spar: 40, klør: 60, ruder: 80, hjerte: 100, sans: 120 }
function livePoint(playerId: number) {
  const s = stik[playerId] ?? 0
  if (meldingSpillerId.value === playerId && meldingFarve.value) {
    if (meldingFarve.value === 'nullo') return s === 0 ? 250 : -250
    const antal = meldingAntal.value ?? 6
    const vaerdi = KONTRAKT_BASE[meldingFarve.value] + Math.max(antal - 6, 0) * 100
    if (s >= antal) return s === 10 ? Math.max(vaerdi, 250) : vaerdi
    return -vaerdi
  }
  return s * 10
}

function farveNavn(id: string) {
  return FARVER.find(f => f.id === id)?.navn ?? id
}
function melderNavn(r: RoundWithPoints) {
  return r.points.find(p => p.player_id === r.melding_spiller_id)?.navn ?? '–'
}
function pointKlasse(r: RoundWithPoints, playerId: number) {
  return gainClass(r.points.find(x => x.player_id === playerId)?.point)
}

async function load() {
  const [games, rs, ts] = await Promise.all([mate500Api.games(), mate500Api.rounds(gameId), mate500Api.totaler(gameId)])
  game.value = games.find(g => g.id === gameId) ?? null
  rounds.value = rs
  totaler.value = ts
  notat.value = game.value?.notat ?? ''
  nulstilForm()
}

function nulstilForm() {
  meldingSpillerId.value = null
  meldingFarve.value = null
  meldingAntal.value = null
  for (const key of Object.keys(stik)) delete stik[Number(key)]
  if (game.value) for (const s of game.value.spillere) stik[s.id] = 0
}

async function gemRunde() {
  gemmer.value = true
  error.value = ''
  try {
    await mate500Api.addRound(gameId, {
      melding_spiller_id: meldingSpillerId.value,
      melding_antal: meldingFarve.value === 'nullo' ? null : meldingAntal.value,
      melding_farve: meldingFarve.value,
      points: Object.entries(stik).map(([player_id, stik_vundet]) => ({ player_id: Number(player_id), stik_vundet })),
    })
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    gemmer.value = false
  }
}

async function sletRunde(id: number) {
  if (!confirm('Slet denne runde?')) return
  await mate500Api.deleteRound(id)
  await load()
}

async function fortrydSeneste() {
  const seneste = rounds.value.at(-1)
  if (!seneste) return
  await mate500Api.deleteRound(seneste.id)
  await load()
}

async function afslutSpil() {
  if (!confirm('Afslut spillet? Der kan ikke tilføjes flere runder bagefter.')) return
  afslutter.value = true
  try {
    await mate500Api.finishGame(gameId)
    await load()
  } finally {
    afslutter.value = false
  }
}

async function gemNotat() {
  await mate500Api.updateGameNote(gameId, notat.value)
}

onMounted(load)
</script>
