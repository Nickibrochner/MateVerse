<template>
  <div class="round-detail-panel">
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="conditions-section">
      <h4 class="disc-title">Forhold</h4>
      <div class="conditions-row">
        <label>
          Vind
          <select v-model="wind" @change="saveConditions">
            <option :value="null">— Ikke angivet —</option>
            <option value="Vindstille">Vindstille</option>
            <option value="Let vind">Let vind</option>
            <option value="Frisk vind">Frisk vind</option>
          </select>
        </label>
        <label>
          Vejr
          <select v-model="weather" @change="saveConditions">
            <option :value="null">— Ikke angivet —</option>
            <option value="Tør bane">Tør bane</option>
            <option value="Våd/fugtig bane">Våd/fugtig bane</option>
          </select>
        </label>
      </div>
    </div>

    <div class="disc-section">
      <h4 class="disc-title">Diske brugt i denne runde</h4>
      <p v-if="discs.length === 0" class="hint">
        Ingen diske registreret endnu — tilføj dem under <strong>Indstillinger → Diske</strong>.
      </p>
      <div v-else class="disc-chips">
        <button
          v-for="d in discs"
          :key="d.id"
          class="disc-chip"
          :class="{ active: selectedDiscIds.includes(d.id) }"
          @click="toggleDisc(d.id)"
        >
          {{ d.name }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="empty-state">Indlæser…</p>
    <template v-else>
      <p class="hint">
        Ret antal kast hvis noget er registreret forkert, eller slet et hul der ikke skal
        tælle med — rundens total genberegnes automatisk.
      </p>
      <table class="fluent-table hole-table">
        <thead>
          <tr>
            <th>Hul</th>
            <th>Par</th>
            <th>Kast</th>
            <th>+/-</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in holes" :key="h.hole_number">
            <td>{{ h.hole_number }}<span v-if="h.course_hole_label" class="hole-label"> — {{ h.course_hole_label }}</span></td>
            <td>{{ h.par }}</td>
            <td>
              <input
                type="number"
                class="strokes-input"
                :value="h.strokes"
                @change="updateStrokes(h.hole_number, $event)"
              />
            </td>
            <td :class="toParClass(h.to_par)">{{ fmt(h.to_par) }}</td>
            <td>
              <button class="btn btn-ghost" @click="removeHole(h.hole_number)">🗑</button>
            </td>
          </tr>
          <tr v-if="holes.length === 0">
            <td colspan="5" class="empty-hint">Ingen hul-data for denne runde.</td>
          </tr>
        </tbody>
        <tfoot v-if="totals">
          <tr class="totals-row">
            <td>Total</td>
            <td>{{ totals.total_par }}</td>
            <td>{{ totals.total_score }}</td>
            <td :class="toParClass(totals.to_par)">{{ fmt(totals.to_par) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { RoundHoleDetail, Disc, RoundConditions, RoundTotals } from '../types'

const props = defineProps<{
  roundId: number
  discs: Disc[]
}>()

const emit = defineEmits<{ updated: [totals: RoundTotals] }>()

const holes = ref<RoundHoleDetail[]>([])
const totals = ref<RoundTotals | null>(null)
const selectedDiscIds = ref<number[]>([])
const wind = ref<string | null>(null)
const weather = ref<string | null>(null)
const loading = ref(false)
const errorMsg = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [h, d, c] = await Promise.all([
      invoke<RoundHoleDetail[]>('get_round_holes', { roundId: props.roundId }),
      invoke<number[]>('get_round_discs', { roundId: props.roundId }),
      invoke<RoundConditions>('get_round_conditions', { roundId: props.roundId }),
    ])
    holes.value = h
    selectedDiscIds.value = d
    wind.value = c.wind
    weather.value = c.weather
    totals.value = computeTotals(h)
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

function computeTotals(h: RoundHoleDetail[]): RoundTotals {
  const total_score = h.reduce((sum, x) => sum + x.strokes, 0)
  const total_par = h.reduce((sum, x) => sum + x.par, 0)
  return { total_score, total_par, to_par: total_score - total_par }
}

async function updateStrokes(holeNumber: number, event: Event) {
  const strokes = Number((event.target as HTMLInputElement).value)
  if (Number.isNaN(strokes)) return
  errorMsg.value = ''
  try {
    const newTotals = await invoke<RoundTotals>('update_round_hole_score', {
      roundId: props.roundId,
      holeNumber,
      strokes,
    })
    const hole = holes.value.find(x => x.hole_number === holeNumber)
    if (hole) {
      hole.strokes = strokes
      hole.to_par = strokes - hole.par
    }
    totals.value = newTotals
    emit('updated', newTotals)
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function removeHole(holeNumber: number) {
  if (!confirm(`Fjern hul ${holeNumber} fra runden? Rundens total genberegnes uden det.`)) return
  errorMsg.value = ''
  try {
    const newTotals = await invoke<RoundTotals>('delete_round_hole_score', {
      roundId: props.roundId,
      holeNumber,
    })
    holes.value = holes.value.filter(x => x.hole_number !== holeNumber)
    totals.value = newTotals
    emit('updated', newTotals)
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function saveConditions() {
  try {
    await invoke('set_round_conditions', { roundId: props.roundId, wind: wind.value, weather: weather.value })
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

onMounted(load)
watch(() => props.roundId, load)

async function toggleDisc(discId: number) {
  const next = selectedDiscIds.value.includes(discId)
    ? selectedDiscIds.value.filter(id => id !== discId)
    : [...selectedDiscIds.value, discId]
  try {
    await invoke('set_round_discs', { roundId: props.roundId, discIds: next })
    selectedDiscIds.value = next
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

function fmt(n: number) {
  return n > 0 ? `+${n}` : n.toString()
}

function toParClass(n: number) {
  if (n < 0) return 'gain'
  if (n > 0) return 'loss'
  return ''
}
</script>

<style scoped>
.round-detail-panel { padding: 12px 0; }

.conditions-section { margin-bottom: 16px; }

.conditions-row {
  display: flex;
  gap: 20px;
}

.conditions-row label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.conditions-row select {
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.disc-section { margin-bottom: 16px; }

.disc-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.disc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.disc-chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--bg-layer);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.disc-chip:hover { background: var(--bg-layer-alt); }

.disc-chip.active {
  background: var(--accent);
  border-color: var(--accent-dark);
  color: var(--text-on-accent);
  font-weight: 600;
}

.hole-table { max-width: 520px; }
.hole-label { color: var(--text-tertiary); font-size: 12px; }

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.strokes-input {
  width: 56px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.totals-row td {
  font-weight: 600;
  border-top: 2px solid var(--border-strong);
}

.empty-hint { color: var(--text-tertiary); }
</style>
