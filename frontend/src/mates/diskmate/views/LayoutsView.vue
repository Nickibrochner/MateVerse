<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Layouts</h1>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div v-if="!loading && courses.length === 0" class="empty-state">
      <p>Ingen baner endnu. Gå til <strong>Importér</strong> for at hente data ind.</p>
    </div>

    <template v-else>
      <div class="rates-bar">
        <label for="course-select">Bane</label>
        <select id="course-select" v-model.number="selectedCourseId" @change="onCourseChange">
          <option v-for="c in courses" :key="c.course_id" :value="c.course_id">{{ c.course_name }}</option>
        </select>
      </div>

      <div class="admin-grid">
        <div class="card">
          <div class="card-body">
            <div class="section-header">
              <h2 class="section-title">Bane</h2>
            </div>
            <div class="rename-row">
              <input v-model="courseNameValue" @keyup.enter="commitCourseRename" />
              <button class="btn btn-subtle" @click="commitCourseRename">Gem navn</button>
              <button class="btn btn-subtle danger-btn" @click="deleteCourse">🗑 Slet bane</button>
            </div>

            <h2 class="section-title">Fysiske huller på banen</h2>
            <p class="hint">
              Disse er banens "kurve" — uafhængige af layout. Kobl et layouts huller til dem
              nedenfor for at kunne sammenligne på tværs af layouts under <strong>Huller</strong>.
            </p>

            <div class="new-hole-row">
              <input
                v-model="newCourseHoleLabel"
                placeholder="Navn på nyt fysisk hul, fx 'Kurv ved søen'"
                @keyup.enter="createCourseHole"
              />
              <button class="btn btn-subtle" @click="createCourseHole">+ Opret</button>
            </div>

            <ul class="physical-hole-list">
              <li v-for="ch in courseHoles" :key="ch.id">
                <template v-if="editingCourseHoleId === ch.id">
                  <input
                    v-model="courseHoleEditValue"
                    class="inline-edit"
                    @keyup.enter="commitCourseHoleRename(ch.id)"
                    @keyup.esc="editingCourseHoleId = null"
                    @blur="commitCourseHoleRename(ch.id)"
                    autofocus
                  />
                </template>
                <span v-else @dblclick="startCourseHoleEdit(ch.id, ch.label)">{{ ch.label }}</span>
                <button class="btn btn-ghost" @click="deleteCourseHole(ch.id)">🗑</button>
              </li>
              <li v-if="courseHoles.length === 0" class="empty-hint">Ingen fysiske huller oprettet endnu.</li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <div class="section-header">
              <h2 class="section-title">Layout</h2>
              <select v-model.number="selectedLayoutId" @change="onLayoutChange">
                <option v-for="l in layoutsForCourse" :key="l.layout_id" :value="l.layout_id">
                  {{ l.layout_name }}
                </option>
              </select>
            </div>

            <template v-if="selectedLayoutId !== null">
              <div class="rename-row">
                <input v-model="layoutNameValue" @keyup.enter="commitLayoutRename" />
                <button class="btn btn-subtle" @click="commitLayoutRename">Gem navn</button>
                <button class="btn btn-subtle danger-btn" @click="deleteLayout">🗑 Slet layout</button>
              </div>

              <table class="fluent-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Par</th>
                    <th>Fysisk hul</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(lh, idx) in layoutHoles" :key="lh.hole_number">
                    <td class="order-cell">
                      <button class="btn btn-ghost order-btn" :disabled="idx === 0" @click="moveHole(lh.hole_number, 'up')">▲</button>
                      <span>{{ lh.hole_number }}</span>
                      <button class="btn btn-ghost order-btn" :disabled="idx === layoutHoles.length - 1" @click="moveHole(lh.hole_number, 'down')">▼</button>
                    </td>
                    <td>
                      <input
                        type="number"
                        class="par-input"
                        :value="lh.par"
                        @change="updateHolePar(lh.hole_number, $event)"
                      />
                    </td>
                    <td>
                      <select :value="lh.course_hole_id ?? ''" @change="updateHoleMapping(lh.hole_number, $event)">
                        <option value="">— Ikke tilknyttet —</option>
                        <option v-for="ch in courseHoles" :key="ch.id" :value="ch.id">{{ ch.label }}</option>
                      </select>
                    </td>
                    <td>
                      <button class="btn btn-ghost" @click="removeLayoutHole(lh.hole_number)">🗑</button>
                    </td>
                  </tr>
                  <tr v-if="layoutHoles.length === 0">
                    <td colspan="4" class="empty-hint">Ingen huller på dette layout endnu.</td>
                  </tr>
                </tbody>
              </table>

              <div class="new-hole-row">
                <input type="number" v-model.number="newHolePar" class="par-input" placeholder="Par" />
                <select v-model="newHoleCourseHoleId">
                  <option value="">— Ikke tilknyttet —</option>
                  <option v-for="ch in courseHoles" :key="ch.id" :value="ch.id">{{ ch.label }}</option>
                </select>
                <button class="btn btn-subtle" @click="addLayoutHole">+ Tilføj hul</button>
              </div>
            </template>

            <p v-else class="empty-state">Denne bane har endnu ingen layouts.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { CourseStat, CourseHole, LayoutHole } from '../types'

const allStats = ref<CourseStat[]>([])
const loading = ref(false)
const errorMsg = ref('')

const selectedCourseId = ref<number | null>(null)
const selectedLayoutId = ref<number | null>(null)

const courseNameValue = ref('')
const layoutNameValue = ref('')

const courseHoles = ref<CourseHole[]>([])
const layoutHoles = ref<LayoutHole[]>([])

const newCourseHoleLabel = ref('')
const newHolePar = ref(3)
const newHoleCourseHoleId = ref<number | ''>('')

const editingCourseHoleId = ref<number | null>(null)
const courseHoleEditValue = ref('')

const courses = computed(() => {
  const seen = new Map<number, string>()
  for (const row of allStats.value) seen.set(row.course_id, row.course_name)
  return Array.from(seen, ([course_id, course_name]) => ({ course_id, course_name })).sort((a, b) =>
    a.course_name.localeCompare(b.course_name),
  )
})

const layoutsForCourse = computed(() =>
  allStats.value
    .filter(s => s.course_id === selectedCourseId.value)
    .sort((a, b) => a.layout_name.localeCompare(b.layout_name)),
)

async function loadCourses() {
  loading.value = true
  errorMsg.value = ''
  try {
    allStats.value = await invoke<CourseStat[]>('get_course_stats', { playerName: null })
    if (selectedCourseId.value === null && courses.value.length > 0) {
      selectedCourseId.value = courses.value[0].course_id
    }
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

async function onCourseChange() {
  const course = courses.value.find(c => c.course_id === selectedCourseId.value)
  courseNameValue.value = course?.course_name ?? ''
  selectedLayoutId.value = layoutsForCourse.value[0]?.layout_id ?? null
  await Promise.all([loadCourseHoles(), onLayoutChange()])
}

async function onLayoutChange() {
  const layout = layoutsForCourse.value.find(l => l.layout_id === selectedLayoutId.value)
  layoutNameValue.value = layout?.layout_name ?? ''
  await loadLayoutHoles()
}

async function loadCourseHoles() {
  if (selectedCourseId.value === null) {
    courseHoles.value = []
    return
  }
  try {
    courseHoles.value = await invoke<CourseHole[]>('get_course_holes', { courseId: selectedCourseId.value })
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function loadLayoutHoles() {
  if (selectedLayoutId.value === null) {
    layoutHoles.value = []
    return
  }
  try {
    layoutHoles.value = await invoke<LayoutHole[]>('get_layout_holes', { layoutId: selectedLayoutId.value })
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

onMounted(async () => {
  await loadCourses()
  courseNameValue.value = courses.value.find(c => c.course_id === selectedCourseId.value)?.course_name ?? ''
  selectedLayoutId.value = layoutsForCourse.value[0]?.layout_id ?? null
  layoutNameValue.value = layoutsForCourse.value[0]?.layout_name ?? ''
  await Promise.all([loadCourseHoles(), loadLayoutHoles()])
})

async function commitCourseRename() {
  if (selectedCourseId.value === null) return
  const newName = courseNameValue.value.trim()
  if (!newName) return
  try {
    await invoke('rename_course', { courseId: selectedCourseId.value, newName })
    await loadCourses()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function commitLayoutRename() {
  if (selectedLayoutId.value === null) return
  const newName = layoutNameValue.value.trim()
  if (!newName) return
  try {
    await invoke('rename_layout', { layoutId: selectedLayoutId.value, newName })
    await loadCourses()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function deleteCourse() {
  if (selectedCourseId.value === null) return
  const course = courses.value.find(c => c.course_id === selectedCourseId.value)
  const totalRounds = layoutsForCourse.value.reduce((sum, l) => sum + l.rounds_played, 0)
  const message =
    `Slet banen "${course?.course_name}" permanent?\n\n` +
    `Dette fjerner alle ${layoutsForCourse.value.length} layout(s) og ${totalRounds} registrerede runde(r) ` +
    `på denne bane. Kan ikke fortrydes.`
  if (!confirm(message)) return
  try {
    await invoke('delete_course', { courseId: selectedCourseId.value })
    selectedCourseId.value = null
    selectedLayoutId.value = null
    await loadCourses()
    await onCourseChange()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function deleteLayout() {
  if (selectedLayoutId.value === null) return
  const layout = layoutsForCourse.value.find(l => l.layout_id === selectedLayoutId.value)
  const message =
    `Slet layoutet "${layout?.layout_name}" permanent?\n\n` +
    `Dette fjerner alle ${layout?.rounds_played ?? 0} registrerede runde(r) på dette layout. Kan ikke fortrydes.`
  if (!confirm(message)) return
  try {
    await invoke('delete_layout', { layoutId: selectedLayoutId.value })
    selectedLayoutId.value = null
    await loadCourses()
    selectedLayoutId.value = layoutsForCourse.value[0]?.layout_id ?? null
    await onLayoutChange()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function createCourseHole() {
  if (selectedCourseId.value === null) return
  const label = newCourseHoleLabel.value.trim()
  if (!label) return
  try {
    const created = await invoke<CourseHole>('create_course_hole', { courseId: selectedCourseId.value, label })
    courseHoles.value = [...courseHoles.value, created].sort((a, b) => a.label.localeCompare(b.label))
    newCourseHoleLabel.value = ''
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

function startCourseHoleEdit(id: number, currentLabel: string) {
  editingCourseHoleId.value = id
  courseHoleEditValue.value = currentLabel
}

async function commitCourseHoleRename(id: number) {
  const newLabel = courseHoleEditValue.value.trim()
  editingCourseHoleId.value = null
  if (!newLabel) return
  try {
    await invoke('rename_course_hole', { courseHoleId: id, newLabel })
    await loadCourseHoles()
    await loadLayoutHoles()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function deleteCourseHole(id: number) {
  if (!confirm('Slet dette fysiske hul? Layout-huller der peger på det bliver "Ikke tilknyttet".')) return
  try {
    await invoke('delete_course_hole', { courseHoleId: id })
    await loadCourseHoles()
    await loadLayoutHoles()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function addLayoutHole() {
  if (selectedLayoutId.value === null) return
  try {
    await invoke('add_layout_hole', {
      layoutId: selectedLayoutId.value,
      par: newHolePar.value,
      courseHoleId: newHoleCourseHoleId.value === '' ? null : Number(newHoleCourseHoleId.value),
    })
    newHolePar.value = 3
    newHoleCourseHoleId.value = ''
    await loadLayoutHoles()
    await loadCourses()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function removeLayoutHole(holeNumber: number) {
  if (selectedLayoutId.value === null) return
  if (!confirm(`Fjern hul ${holeNumber} fra layoutet?`)) return
  try {
    await invoke('remove_layout_hole', { layoutId: selectedLayoutId.value, holeNumber })
    await loadLayoutHoles()
    await loadCourses()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function updateHolePar(holeNumber: number, event: Event) {
  if (selectedLayoutId.value === null) return
  const par = Number((event.target as HTMLInputElement).value)
  if (Number.isNaN(par)) return
  try {
    await invoke('update_layout_hole_par', { layoutId: selectedLayoutId.value, holeNumber, par })
    const lh = layoutHoles.value.find(l => l.hole_number === holeNumber)
    if (lh) lh.par = par
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function updateHoleMapping(holeNumber: number, event: Event) {
  if (selectedLayoutId.value === null) return
  const value = (event.target as HTMLSelectElement).value
  const courseHoleId = value === '' ? null : Number(value)
  try {
    await invoke('set_layout_hole_mapping', { layoutId: selectedLayoutId.value, holeNumber, courseHoleId })
    const lh = layoutHoles.value.find(l => l.hole_number === holeNumber)
    if (lh) {
      lh.course_hole_id = courseHoleId
      lh.course_hole_label = courseHoles.value.find(ch => ch.id === courseHoleId)?.label ?? null
    }
  } catch (e) {
    errorMsg.value = errText(e)
  }
}

async function moveHole(holeNumber: number, direction: 'up' | 'down') {
  if (selectedLayoutId.value === null) return
  try {
    await invoke('move_layout_hole', { layoutId: selectedLayoutId.value, holeNumber, direction })
    await loadLayoutHoles()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}
</script>

<style scoped>
.admin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-header select {
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.rename-row {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}

.rename-row input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.danger-btn {
  color: var(--danger);
  border-color: var(--danger);
  flex-shrink: 0;
}
.danger-btn:hover { background: var(--danger-bg); }

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.new-hole-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.new-hole-row input,
.new-hole-row select {
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12px;
}

.new-hole-row input[placeholder] { flex: 1; }
.new-hole-row .par-input { width: 60px; }

.physical-hole-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.physical-hole-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-layer-alt);
  font-size: 13px;
}

.physical-hole-list li span { cursor: text; }

.order-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-btn {
  padding: 2px 6px;
  font-size: 10px;
}

.par-input {
  width: 56px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.empty-hint { color: var(--text-tertiary); font-size: 13px; }

.inline-edit {
  padding: 3px 6px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: inherit;
  outline: none;
}
</style>
