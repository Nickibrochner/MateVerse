<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Spiller</h1>
      <button
        class="btn btn-subtle"
        :disabled="!selectedPlayer || exporting"
        @click="exportJson"
      >
        {{ exporting ? 'Eksporterer…' : '⬇️ Eksportér JSON' }}
      </button>
    </div>

    <div class="rates-bar">
      <label for="player-select">Spiller</label>
      <select id="player-select" v-model="selectedPlayer" @change="loadAll">
        <option v-for="p in players" :key="p" :value="p">{{ p }}</option>
      </select>
    </div>

    <p v-if="exportMsg" class="success-msg">{{ exportMsg }}</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div v-if="!loading && players.length === 0" class="empty-state">
      <p>Ingen spillere endnu. Gå til <strong>Importér</strong> for at hente data ind.</p>
    </div>

    <template v-else-if="selectedPlayer">
      <div class="summary-grid" v-if="summary">
        <div class="summary-card">
          <span class="summary-label">Runder i alt</span>
          <span class="summary-value">{{ summary.rounds_played }}</span>
        </div>
        <div class="summary-card" :class="summary.rounds_played ? toParCardClass(summary.avg_to_par) : ''">
          <span class="summary-label">Gns. score ift. par</span>
          <span class="summary-value">{{ summary.rounds_played ? fmt(summary.avg_to_par) : '–' }}</span>
        </div>
        <div class="summary-card gain">
          <span class="summary-label">Bedste runde</span>
          <span class="summary-value">{{ summary.rounds_played ? fmt(summary.best_to_par) : '–' }}</span>
        </div>
        <div class="summary-card loss">
          <span class="summary-label">Dårligste runde</span>
          <span class="summary-value">{{ summary.rounds_played ? fmt(summary.worst_to_par) : '–' }}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Gns. UDisc rating</span>
          <span class="summary-value">{{ summary.avg_rating !== null ? summary.avg_rating.toFixed(0) : '–' }}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Periode</span>
          <span class="summary-value period-value">{{ periodLabel }}</span>
        </div>
      </div>

      <div class="card rating-card">
        <div class="card-body">
          <h2 class="section-title">Udvikling i UDisc rating</h2>
          <HistoryChart
            :points="ratingPoints"
            series-label="UDisc rating"
            y-axis-label="Rating"
            empty-text="Ingen runder med et registreret UDisc rating-tal endnu. Du kan tilføje det manuelt i tabellen nedenfor."
          />
        </div>
      </div>

      <BadgeGrid :key="selectedPlayer" :player-name="selectedPlayer" />

      <HeadToHead :key="selectedPlayer" :player-name="selectedPlayer" :all-players="players" />

      <div class="card">
        <div class="card-body">
          <h2 class="section-title">Seneste runder</h2>
          <table class="fluent-table">
            <thead>
              <tr>
                <th>Dato</th>
                <th>Bane</th>
                <th>Layout</th>
                <th>Score</th>
                <th>+/-</th>
                <th>UDisc rating</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in rounds" :key="r.round_id">
                <tr>
                  <td>{{ r.date }}</td>
                  <td>{{ r.course_name }}</td>
                  <td>{{ r.layout_name }}</td>
                  <td>{{ r.total_score }}</td>
                  <td :class="toParClass(r.to_par)">{{ fmt(r.to_par) }}</td>
                  <td>
                    <input
                      type="number"
                      class="rating-input"
                      :value="r.rating ?? ''"
                      placeholder="—"
                      @change="updateRating(r.round_id, $event)"
                    />
                  </td>
                  <td>
                    <button class="btn btn-ghost" @click="toggleRoundExpand(r.round_id)">
                      {{ expandedRoundId === r.round_id ? 'Skjul' : 'Detaljer' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedRoundId === r.round_id">
                  <td colspan="7" class="details-cell">
                    <RoundDetailPanel :round-id="r.round_id" :discs="discs" @updated="totals => onRoundUpdated(r.round_id, totals)" />
                  </td>
                </tr>
              </template>
              <tr v-if="rounds.length === 0">
                <td colspan="7" class="empty-hint">Ingen runder registreret endnu.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h2 class="section-title">Statistik pr. bane</h2>
          <table class="fluent-table">
            <thead>
              <tr>
                <th>Bane</th>
                <th>Layout</th>
                <th>Runder</th>
                <th>Gns. +/-</th>
                <th>Bedst</th>
                <th>Værst</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in playedCourseStats" :key="c.layout_id">
                <td>{{ c.course_name }}</td>
                <td>{{ c.layout_name }}</td>
                <td>{{ c.rounds_played }}</td>
                <td :class="toParClass(c.avg_to_par)">{{ fmt(c.avg_to_par) }}</td>
                <td :class="toParClass(c.best_to_par)">{{ fmt(c.best_to_par) }}</td>
                <td :class="toParClass(c.worst_to_par)">{{ fmt(c.worst_to_par) }}</td>
              </tr>
              <tr v-if="playedCourseStats.length === 0">
                <td colspan="6" class="empty-hint">Ingen runder registreret endnu.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { downloadJson, invoke, errText } from '../invoke'
import type { PlayerSummary, PlayerRound, CourseStat, Disc, RoundTotals } from '../types'
import HistoryChart, { type ChartPoint } from '../components/HistoryChart.vue'
import HeadToHead from '../components/HeadToHead.vue'
import BadgeGrid from '../components/BadgeGrid.vue'
import RoundDetailPanel from '../components/RoundDetailPanel.vue'

const players = ref<string[]>([])
const selectedPlayer = ref('')
const summary = ref<PlayerSummary | null>(null)
const rounds = ref<PlayerRound[]>([])
const courseStats = ref<CourseStat[]>([])
const discs = ref<Disc[]>([])
const expandedRoundId = ref<number | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const exporting = ref(false)
const exportMsg = ref('')

const ratingPoints = computed<ChartPoint[]>(() =>
  [...rounds.value]
    .filter(r => r.rating !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, value: r.rating as number })),
)

const playedCourseStats = computed(() => courseStats.value.filter(c => c.rounds_played > 0))

const periodLabel = computed(() => {
  if (!summary.value?.first_round_date || !summary.value?.last_round_date) return '–'
  const first = summary.value.first_round_date.slice(0, 10)
  const last = summary.value.last_round_date.slice(0, 10)
  return first === last ? first : `${first} – ${last}`
})

async function loadPlayers() {
  players.value = await invoke<string[]>('get_players')
  if (players.value.length > 0 && !selectedPlayer.value) {
    selectedPlayer.value = players.value[0]
  }
}

async function loadDiscs() {
  try {
    discs.value = await invoke<Disc[]>('get_discs')
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

function toggleRoundExpand(roundId: number) {
  expandedRoundId.value = expandedRoundId.value === roundId ? null : roundId
}

async function loadAll() {
  if (!selectedPlayer.value) return
  loading.value = true
  errorMsg.value = ''
  expandedRoundId.value = null
  try {
    const [s, r, cs] = await Promise.all([
      invoke<PlayerSummary>('get_player_summary', { playerName: selectedPlayer.value }),
      invoke<PlayerRound[]>('get_player_rounds', { playerName: selectedPlayer.value }),
      invoke<CourseStat[]>('get_course_stats', { playerName: selectedPlayer.value }),
    ])
    summary.value = s
    rounds.value = r
    courseStats.value = cs
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await loadPlayers()
    await loadAll()
    await loadDiscs()
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
})

async function exportJson() {
  if (!selectedPlayer.value) return
  exportMsg.value = ''
  errorMsg.value = ''

  exporting.value = true
  try {
    downloadJson(`${selectedPlayer.value}-diskmate-export.json`, await invoke('export_player_json', { playerName: selectedPlayer.value }))
    exportMsg.value = 'Eksporten er hentet.'
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    exporting.value = false
  }
}

async function refreshAggregates() {
  if (!selectedPlayer.value) return
  try {
    const [s, cs] = await Promise.all([
      invoke<PlayerSummary>('get_player_summary', { playerName: selectedPlayer.value }),
      invoke<CourseStat[]>('get_course_stats', { playerName: selectedPlayer.value }),
    ])
    summary.value = s
    courseStats.value = cs
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

function onRoundUpdated(roundId: number, totals: RoundTotals) {
  const r = rounds.value.find(x => x.round_id === roundId)
  if (r) {
    r.total_score = totals.total_score
    r.to_par = totals.to_par
  }
  refreshAggregates()
}

async function updateRating(roundId: number, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const rating = raw === '' ? null : Number(raw)
  if (rating !== null && Number.isNaN(rating)) return
  try {
    await invoke('update_round_rating', { roundId, rating })
    const r = rounds.value.find(x => x.round_id === roundId)
    if (r) r.rating = rating
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

function fmt(n: number) {
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

function toParClass(n: number) {
  if (n < 0) return 'gain'
  if (n > 0) return 'loss'
  return ''
}

function toParCardClass(n: number) {
  if (n < 0) return 'gain'
  if (n > 0) return 'loss'
  return ''
}
</script>

<style scoped>
.rating-card { margin-bottom: 16px; }
.card { margin-bottom: 16px; }
.period-value { font-size: 14px; }
.details-cell { background: var(--bg-layer-alt); }

.success-msg {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
}

.rating-input {
  width: 70px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.empty-hint { color: var(--text-tertiary); }
</style>
