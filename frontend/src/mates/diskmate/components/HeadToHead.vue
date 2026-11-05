<template>
  <div class="card head-to-head">
    <div class="card-body">
      <div class="h2h-header">
        <h2 class="section-title">Hoved-til-hoved</h2>
        <select v-model="opponent" @change="load">
          <option value="">— Vælg modstander —</option>
          <option v-for="p in opponents" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p v-if="!opponent" class="empty-state">Vælg en spiller at sammenligne med.</p>
      <p v-else-if="loading" class="empty-state">Indlæser…</p>

      <template v-else-if="data">
        <div class="tally">
          <div class="tally-item">
            <span class="tally-value">{{ data.a_wins }}</span>
            <span class="tally-label">{{ playerName }}</span>
          </div>
          <div class="tally-item">
            <span class="tally-value">{{ data.ties }}</span>
            <span class="tally-label">Uafgjort</span>
          </div>
          <div class="tally-item">
            <span class="tally-value">{{ data.b_wins }}</span>
            <span class="tally-label">{{ opponent }}</span>
          </div>
        </div>

        <HistoryChart
          :series="[
            { label: playerName, points: chartPoints(data, 'a') },
            { label: opponent, points: chartPoints(data, 'b') },
          ]"
          reverse-y
          empty-text="I har ikke spillet sammen endnu."
        />

        <table v-if="data.rounds.length" class="fluent-table">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Bane</th>
              <th>{{ playerName }}</th>
              <th>{{ opponent }}</th>
              <th>Vinder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.rounds" :key="r.date">
              <td>{{ r.date }}</td>
              <td>{{ r.course_name }} — {{ r.layout_name }}</td>
              <td :class="toParClass(r.a_to_par)">{{ fmt(r.a_to_par) }}</td>
              <td :class="toParClass(r.b_to_par)">{{ fmt(r.b_to_par) }}</td>
              <td>{{ r.winner ?? 'Uafgjort' }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { invoke, errText } from '../invoke'
import type { HeadToHead } from '../types'
import HistoryChart, { type ChartPoint } from './HistoryChart.vue'

const props = defineProps<{
  playerName: string
  allPlayers: string[]
}>()

const opponent = ref('')
const data = ref<HeadToHead | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const opponents = computed(() => props.allPlayers.filter(p => p !== props.playerName))

async function load() {
  if (!opponent.value) {
    data.value = null
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    data.value = await invoke<HeadToHead>('get_head_to_head', {
      playerA: props.playerName,
      playerB: opponent.value,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

function chartPoints(d: HeadToHead, who: 'a' | 'b'): ChartPoint[] {
  return [...d.rounds]
    .sort((x, y) => x.date.localeCompare(y.date))
    .map(r => ({ date: r.date, value: who === 'a' ? r.a_to_par : r.b_to_par }))
}

function fmt(n: number) {
  return n > 0 ? `+${n.toFixed(0)}` : n.toFixed(0)
}

function toParClass(n: number) {
  if (n < 0) return 'gain'
  if (n > 0) return 'loss'
  return ''
}
</script>

<style scoped>
.head-to-head { margin-bottom: 16px; }

.h2h-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.h2h-header select {
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.tally {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 20px;
}

.tally-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tally-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
}

.tally-label {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
