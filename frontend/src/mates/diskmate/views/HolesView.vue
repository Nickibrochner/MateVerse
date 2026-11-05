<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Huller</h1>
    </div>

    <div class="rates-bar">
      <label for="course-filter">Bane</label>
      <select id="course-filter" v-model.number="selectedCourseId" @change="loadCourseHoleStats">
        <option v-for="c in courses" :key="c.course_id" :value="c.course_id">{{ c.course_name }}</option>
      </select>

      <label for="player-filter">Spiller</label>
      <select id="player-filter" v-model="selectedPlayer" @change="loadCourseHoleStats">
        <option value="">Alle spillere</option>
        <option v-for="p in players" :key="p" :value="p">{{ p }}</option>
      </select>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading" class="empty-state">Indlæser…</p>

    <div v-if="!loading && courses.length === 0" class="empty-state">
      <p>Ingen baner endnu. Gå til <strong>Importér</strong> for at hente data ind.</p>
    </div>

    <div v-else-if="!loading" class="card">
      <div class="card-body">
        <p class="hint">
          Hvert fysisk hul kan optræde på flere layouts. Administrér hvilke huller der findes,
          og hvordan et layouts huller kobles til dem, under <strong>Indstillinger → Layouts</strong>.
        </p>

        <table class="fluent-table">
          <thead>
            <tr>
              <th>Hul</th>
              <th>Layouts</th>
              <th>Spillet</th>
              <th>Gns. kast</th>
              <th>Gns. +/-</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="ch in courseHoleStats" :key="ch.course_hole_id">
              <tr>
                <td>{{ ch.label }}</td>
                <td>
                  <span v-if="ch.layouts.length === 0" class="empty-hint">—</span>
                  <span v-for="name in ch.layouts" :key="name" class="badge layout-badge">{{ name }}</span>
                </td>
                <td>{{ ch.times_played }}</td>
                <td>{{ ch.times_played ? ch.avg_strokes.toFixed(2) : '–' }}</td>
                <td :class="toParClass(ch.avg_to_par)">
                  {{ ch.times_played ? fmt(ch.avg_to_par) : '–' }}
                </td>
                <td>
                  <button class="btn btn-ghost" @click="toggleExpand(ch.course_hole_id)">
                    {{ expandedId === ch.course_hole_id ? 'Skjul' : 'Udvikling' }}
                  </button>
                </td>
              </tr>
              <tr v-if="expandedId === ch.course_hole_id">
                <td colspan="6" class="details-cell">
                  <template v-if="selectedPlayer">
                    <h3 class="section-title">Udvikling for {{ selectedPlayer }} — {{ ch.label }}</h3>
                    <p v-if="loadingDetails" class="empty-state">Indlæser…</p>
                    <HistoryChart
                      v-else
                      :points="holeHistory.map(h => ({ date: h.date, value: h.to_par }))"
                      :series-label="`${selectedPlayer} — score ift. par på ${ch.label}`"
                      empty-text="Ingen runder registreret for denne spiller på dette hul endnu."
                      reverse-y
                    />
                  </template>
                  <p v-else class="empty-state">Vælg en spiller for at se udvikling over tid.</p>
                </td>
              </tr>
            </template>
            <tr v-if="courseHoleStats.length === 0">
              <td colspan="6" class="empty-hint">
                Ingen fysiske huller endnu — opret dem under <strong>Indstillinger → Layouts</strong>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { CourseStat, CourseHoleStat, CourseHoleHistoryPoint } from '../types'
import HistoryChart from '../components/HistoryChart.vue'

const courses = ref<{ course_id: number; course_name: string }[]>([])
const selectedCourseId = ref<number | null>(null)
const players = ref<string[]>([])
const selectedPlayer = ref('')

const courseHoleStats = ref<CourseHoleStat[]>([])
const loading = ref(false)
const errorMsg = ref('')

const expandedId = ref<number | null>(null)
const holeHistory = ref<CourseHoleHistoryPoint[]>([])
const loadingDetails = ref(false)

async function loadCourses() {
  const stats = await invoke<CourseStat[]>('get_course_stats', { playerName: null })
  const seen = new Map<number, string>()
  for (const row of stats) seen.set(row.course_id, row.course_name)
  courses.value = Array.from(seen, ([course_id, course_name]) => ({ course_id, course_name }))
    .sort((a, b) => a.course_name.localeCompare(b.course_name))
  if (courses.value.length > 0 && selectedCourseId.value === null) {
    selectedCourseId.value = courses.value[0].course_id
  }
}

async function loadPlayers() {
  players.value = await invoke<string[]>('get_players')
}

async function loadCourseHoleStats() {
  if (selectedCourseId.value === null) {
    courseHoleStats.value = []
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    courseHoleStats.value = await invoke<CourseHoleStat[]>('get_course_hole_stats', {
      courseId: selectedCourseId.value,
      playerName: selectedPlayer.value || null,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadCourses(), loadPlayers()])
    await loadCourseHoleStats()
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
})

async function toggleExpand(courseHoleId: number) {
  if (expandedId.value === courseHoleId) {
    expandedId.value = null
    return
  }
  expandedId.value = courseHoleId
  if (!selectedPlayer.value) return
  loadingDetails.value = true
  try {
    holeHistory.value = await invoke<CourseHoleHistoryPoint[]>('get_course_hole_history', {
      courseHoleId,
      playerName: selectedPlayer.value,
    })
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
.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
  max-width: 640px;
}

.layout-badge {
  background: var(--accent-subtle);
  color: var(--accent-dark);
  margin-right: 4px;
  margin-bottom: 2px;
}

.empty-hint { color: var(--text-tertiary); }

.details-cell { background: var(--bg-layer-alt); }
</style>
