<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold flex items-center gap-3">
          <span v-if="project" class="w-4 h-4 rounded-full" :style="{ background: project.color }" />
          {{ project ? project.name : 'Board' }}
        </h1>
        <p class="text-stone-500 mt-1">{{ project ? 'Projektets opgaver' : 'Alle aktive opgaver' }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <select v-model="assigneeFilter" class="field !w-auto !py-1.5 text-sm" aria-label="Filtrér på person">
          <option value="all">Alle personer</option>
          <option value="none">Ikke tildelt</option>
          <option v-for="u in usersStore.users" :key="u.id" :value="String(u.id)">{{ u.username }}</option>
        </select>
        <button type="button" class="btn-primary" @click="openTask(null, 'todo')">+ Ny opgave</button>
      </div>
    </div>
    <KanNav />

    <p v-if="error" class="panel text-loss">{{ error }}</p>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      <section
        v-for="c in COLUMNS"
        :key="c.id"
        class="rounded-xl bg-stone-200/50 p-3 min-h-[12rem] transition-colors"
        :class="dropTarget === c.id && 'ring-2 ring-accent bg-accent-soft'"
        @dragover.prevent="dropTarget = c.id"
        @dragleave.self="dropTarget = null"
        @drop.prevent="onDrop($event, c.id)"
      >
        <header class="flex items-center justify-between mb-3 px-1">
          <h2 class="font-display font-bold text-stone-700">{{ c.label }} <span class="text-stone-400 font-normal">{{ byColumn[c.id].length }}</span></h2>
          <div class="flex gap-1">
            <button v-if="c.id === 'done' && byColumn.done.length" type="button" class="text-xs text-stone-500 hover:text-accent" @click="archiveDone">
              📥 Arkivér alle
            </button>
            <button type="button" class="btn-icon !w-7 !h-7" :aria-label="`Ny opgave i ${c.label}`" @click="openTask(null, c.id)">+</button>
          </div>
        </header>
        <ul class="space-y-2">
          <li v-for="t in byColumn[c.id]" :key="t.id" @dragover.prevent.stop="dropTarget = c.id; dropBefore = t.id" @drop.prevent.stop="onDrop($event, c.id, t.id)">
            <div v-if="dropTarget === c.id && dropBefore === t.id" class="h-1 rounded bg-accent mb-2" />
            <TaskCard
              :task="t"
              :project="projectsById.get(t.project_id ?? -1)"
              :show-project="!project"
              @edit="openTask(t)"
              @toggle="toggle"
              @move="col => move(t.id, col)"
              @archive="archive(t.id)"
            />
          </li>
        </ul>
        <p v-if="!byColumn[c.id].length" class="text-sm text-stone-400 text-center py-6">Træk opgaver hertil</p>
      </section>
    </div>

    <Modal :open="taskOpen" :title="editingTask ? 'Rediger opgave' : 'Ny opgave'" wide @close="taskOpen = false">
      <TaskForm
        v-if="taskOpen"
        :task="editingTask"
        :projects="projects"
        :defaults="{ column_name: newColumn, project_id: projectId }"
        @saved="taskOpen = false; load()"
        @close="taskOpen = false"
      />
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import KanNav from '../components/KanNav.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskForm from '../components/TaskForm.vue'
import { COLUMNS, kanApi, type Column, type Project, type Task } from '../api'
import { useUsersStore } from '../../../stores/users'

const route = useRoute()
const usersStore = useUsersStore()
const projectId = computed(() => (route.params.projectId ? Number(route.params.projectId) : null))

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const error = ref<string | null>(null)
const assigneeFilter = ref('all')

const projectsById = computed(() => new Map(projects.value.map(p => [p.id, p])))
const project = computed(() => (projectId.value != null ? projectsById.value.get(projectId.value) : undefined))

const byColumn = computed(() => {
  const visible = tasks.value.filter(t =>
    assigneeFilter.value === 'all' ||
    (assigneeFilter.value === 'none' ? t.assigned_to == null : String(t.assigned_to) === assigneeFilter.value))
  return Object.fromEntries(COLUMNS.map(c => [c.id, visible.filter(t => t.column_name === c.id)])) as Record<Column, Task[]>
})

async function load() {
  try {
    ;[tasks.value, projects.value] = await Promise.all([kanApi.tasks(projectId.value ?? undefined), kanApi.projects()])
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(projectId, load, { immediate: true })

/** Kører en ændring og genindlæser; fejl vises øverst. */
async function run(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    error.value = (e as Error).message
  }
  await load()
}

const move = (id: number, col: Column, before: number | null = null) => run(() => kanApi.moveTask(id, col, before))
const toggle = (subId: number) => run(() => kanApi.toggleSubtask(subId))
const archive = (id: number) => run(() => kanApi.archiveTask(id))
const archiveDone = () => run(() => kanApi.archiveDone(projectId.value))

// ── Træk og slip ──
const dropTarget = ref<Column | null>(null)
const dropBefore = ref<number | null>(null)
function onDrop(e: DragEvent, col: Column, before: number | null = null) {
  const id = Number(e.dataTransfer?.getData('text/plain'))
  dropTarget.value = null
  dropBefore.value = null
  if (id && id !== before) move(id, col, before)
}

// ── Opgaveformular ──
const taskOpen = ref(false)
const editingTask = ref<Task | null>(null)
const newColumn = ref<Column>('todo')
function openTask(t: Task | null, col: Column = 'todo') {
  editingTask.value = t
  newColumn.value = col
  taskOpen.value = true
}
</script>
