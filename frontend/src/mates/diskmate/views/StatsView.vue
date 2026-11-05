<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Statistik</h1>
    </div>

    <div class="rates-bar">
      <label for="player-filter">Spiller</label>
      <select id="player-filter" v-model="selectedPlayer" @change="loadCourseStats">
        <option value="">Alle spillere</option>
        <option v-for="p in players" :key="p" :value="p">{{ p }}</option>
      </select>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading" class="empty-state">Indlæser…</p>

    <div v-if="!loading && groupedByCourse.length === 0" class="empty-state">
      <p>Ingen baner endnu. Gå til <strong>Importér</strong> for at hente data ind.</p>
    </div>

    <div v-for="course in groupedByCourse" :key="course.course_id" class="card course-card">
      <div class="card-body">
        <h2 class="section-title">{{ course.course_name }}</h2>

        <table class="fluent-table">
          <thead>
            <tr>
              <th>Layout</th>
              <th>Huller</th>
              <th>Runder</th>
              <th>Gns. +/-</th>
              <th>Bedst</th>
              <th>Værst</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="layout in course.layouts" :key="layout.layout_id">
              <tr>
                <td>{{ layout.layout_name }}</td>
                <td>{{ layout.hole_count }}</td>
                <td>{{ layout.rounds_played }}</td>
                <td :class="toParClass(layout.avg_to_par)">
                  {{ layout.rounds_played ? fmt(layout.avg_to_par) : '–' }}
                </td>
                <td :class="toParClass(layout.best_to_par)">
                  {{ layout.rounds_played ? fmt(layout.best_to_par) : '–' }}
                </td>
                <td :class="toParClass(layout.worst_to_par)">
                  {{ layout.rounds_played ? fmt(layout.worst_to_par) : '–' }}
                </td>
                <td>
                  <button class="btn btn-ghost" @click="toggleExpand(layout.layout_id)">
                    {{ expandedLayoutId === layout.layout_id ? 'Skjul' : 'Detaljer' }}
                  </button>
                </td>
              </tr>
              <tr v-if="expandedLayoutId === layout.layout_id">
                <td colspan="7" class="details-cell">
                  <p v-if="loadingDetails" class="empty-state">Indlæser detaljer…</p>
                  <template v-else>
                    <h3 class="section-title">Hul-for-hul</h3>
                    <table class="fluent-table hole-table">
                      <thead>
                        <tr>
                          <th>Hul</th>
                          <th>Par</th>
                          <th>Spillet</th>
                          <th>Gns. kast</th>
                          <th>Gns. +/-</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="h in holeStats" :key="h.hole_number">
                          <td>{{ h.hole_number }}</td>
                          <td>{{ h.par }}</td>
                          <td>{{ h.times_played }}</td>
                          <td>{{ h.times_played ? h.avg_strokes.toFixed(2) : '–' }}</td>
                          <td :class="toParClass(h.avg_to_par)">
                            {{ h.times_played ? fmt(h.avg_to_par) : '–' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p class="hint">
                      Vil du tilføje/fjerne huller, rette par eller sammenkoble huller på tværs af
                      layouts? Det gør du under <strong>Indstillinger → Layouts</strong>.
                    </p>

                    <template v-if="selectedPlayer">
                      <h3 class="section-title">Udvikling for {{ selectedPlayer }}</h3>
                      <HistoryChart
                        :points="history.map(h => ({ date: h.date, value: h.to_par }))"
                        :series-label="`${selectedPlayer} — score ift. par`"
                        empty-text="Ingen runder registreret for denne spiller på dette layout endnu."
                        reverse-y
                      />
                    </template>
                    <p v-else class="empty-state">Vælg en spiller for at se udvikling over tid.</p>
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { CourseStat, HoleStat, HistoryPoint } from '../types'
import HistoryChart from '../components/HistoryChart.vue'

const players = ref<string[]>([])
const selectedPlayer = ref('')
const courseStats = ref<CourseStat[]>([])
const loading = ref(false)
const errorMsg = ref('')

const expandedLayoutId = ref<number | null>(null)
const holeStats = ref<HoleStat[]>([])
const history = ref<HistoryPoint[]>([])
const loadingDetails = ref(false)

const groupedByCourse = computed(() => {
  const map = new Map<number, { course_id: number; course_name: string; layouts: CourseStat[] }>()
  for (const row of courseStats.value) {
    if (!map.has(row.course_id)) {
      map.set(row.course_id, { course_id: row.course_id, course_name: row.course_name, layouts: [] })
    }
    map.get(row.course_id)!.layouts.push(row)
  }
  return Array.from(map.values())
})

async function loadPlayers() {
  try {
    players.value = await invoke<string[]>('get_players')
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function loadCourseStats() {
  loading.value = true
  errorMsg.value = ''
  try {
    courseStats.value = await invoke<CourseStat[]>('get_course_stats', {
      playerName: selectedPlayer.value || null,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadPlayers(), loadCourseStats()])
})

async function toggleExpand(layoutId: number) {
  if (expandedLayoutId.value === layoutId) {
    expandedLayoutId.value = null
    return
  }
  expandedLayoutId.value = layoutId
  loadingDetails.value = true
  try {
    holeStats.value = await invoke<HoleStat[]>('get_hole_stats', {
      layoutId,
      playerName: selectedPlayer.value || null,
    })
    history.value = selectedPlayer.value
      ? await invoke<HistoryPoint[]>('get_history', { layoutId, playerName: selectedPlayer.value })
      : []
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loadingDetails.value = false
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
</script>

<style scoped>
.course-card { margin-bottom: 16px; }
.hole-table { max-width: 560px; }
.details-cell { background: var(--bg-layer-alt); }

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 20px;
  max-width: 560px;
}
</style>
