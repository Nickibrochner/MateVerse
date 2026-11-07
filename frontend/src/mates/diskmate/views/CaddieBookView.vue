<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Caddiebog</h1>
    </div>

    <div class="rates-bar">
      <label for="course-filter">Bane</label>
      <select id="course-filter" v-model.number="selectedCourseId" @change="loadHoles">
        <option v-for="c in courses" :key="c.course_id" :value="c.course_id">{{ c.course_name }}</option>
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
          Taktiske scouting-noter pr. fysisk hul, opdelt på tee-farve (Rød/Gul/Hvid) — samme
          kurv kan have forskellig par/længde alt efter hvilken farve man spiller fra.
        </p>

        <div v-for="ch in courseHoleStats" :key="ch.course_hole_id" class="hole-block">
          <button class="hole-header" @click="toggleExpand(ch.course_hole_id)">
            <span class="hole-label">{{ ch.label }}</span>
            <span class="expand-icon">{{ expandedId === ch.course_hole_id ? '▲' : '▼' }}</span>
          </button>

          <div v-if="expandedId === ch.course_hole_id" class="hole-body">
            <div class="tee-tabs">
              <button
                v-for="color in TEE_COLORS"
                :key="color"
                class="tee-tab"
                :class="{ active: activeTeeColor === color }"
                @click="activeTeeColor = color"
              >
                {{ color }}
              </button>
            </div>
            <p class="matching-layouts">
              <template v-if="ch.layouts.length > 0">
                Findes på layout: {{ ch.layouts.join(', ') }}
              </template>
              <template v-else>
                Dette fysiske hul er ikke knyttet til et layout endnu.
              </template>
            </p>
            <CaddieNotePanel :course-hole-id="ch.course_hole_id" :tee-color="activeTeeColor" />
          </div>
        </div>

        <p v-if="courseHoleStats.length === 0" class="empty-hint">
          Ingen fysiske huller endnu — opret dem under <strong>Indstillinger → Layouts</strong>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import { TEE_COLORS, type CourseStat, type CourseHoleStat, type TeeColor } from '../types'
import CaddieNotePanel from '../components/CaddieNotePanel.vue'

const courses = ref<{ course_id: number; course_name: string }[]>([])
const selectedCourseId = ref<number | null>(null)

const courseHoleStats = ref<CourseHoleStat[]>([])
const loading = ref(false)
const errorMsg = ref('')

const expandedId = ref<number | null>(null)
const activeTeeColor = ref<TeeColor>('Rød')

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

async function loadHoles() {
  if (selectedCourseId.value === null) {
    courseHoleStats.value = []
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    courseHoleStats.value = await invoke<CourseHoleStat[]>('get_course_hole_stats', {
      courseId: selectedCourseId.value,
      playerName: null,
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
    await loadCourses()
    await loadHoles()
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
})

function toggleExpand(courseHoleId: number) {
  expandedId.value = expandedId.value === courseHoleId ? null : courseHoleId
}
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
  max-width: 680px;
}

.hole-block {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  overflow: hidden;
}

.hole-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-layer);
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
}

.hole-header:hover { background: var(--bg-layer-alt); }

.hole-label { font-weight: 600; }
.expand-icon { font-size: 10px; color: var(--text-tertiary); }

.hole-body {
  padding: 14px;
  background: var(--bg-layer-alt);
}

.tee-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tee-tab {
  padding: 6px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.tee-tab.active {
  background: var(--accent);
  border-color: var(--accent-dark);
  color: var(--text-on-accent);
}

.matching-layouts {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.empty-hint { color: var(--text-tertiary); font-size: 13px; }
</style>
