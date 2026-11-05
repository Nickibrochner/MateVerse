<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <h1 class="text-3xl font-bold">Deadlines</h1>
    <KanNav />
    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!groups.some(g => g.items.length)" class="text-stone-500">Ingen aktive opgaver med deadline.</p>
    <section v-for="g in groups.filter(g => g.items.length)" :key="g.title">
      <h2 class="section-title flex items-center gap-2"><span class="w-2 h-2 rounded-full" :class="g.dot" />{{ g.title }} ({{ g.items.length }})</h2>
      <ul class="space-y-2">
        <li v-for="t in g.items" :key="t.id" class="panel !p-4 flex flex-wrap items-center gap-4">
          <div class="w-28 shrink-0">
            <div class="font-semibold tabular-nums">{{ date(t.deadline!) }}</div>
            <div class="text-xs" :class="g.text">{{ deadlineLabel(t.deadline!) }}</div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold">{{ t.title }}</div>
            <div class="text-xs text-stone-500 flex flex-wrap gap-x-3">
              <span v-if="t.project_id != null" :style="{ color: projectsById.get(t.project_id)?.color }">{{ projectsById.get(t.project_id)?.name }}</span>
              <span>{{ COLUMNS.find(c => c.id === t.column_name)?.label }}</span>
              <span v-if="t.assigned_to != null">{{ usersStore.byId(t.assigned_to)?.username }}</span>
            </div>
          </div>
          <div v-if="t.subtasks.length" class="w-32">
            <div class="text-xs text-stone-500">{{ done(t) }}/{{ t.subtasks.length }} underopgaver</div>
            <div class="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
              <div class="h-full bg-accent" :style="{ width: `${(done(t) / t.subtasks.length) * 100}%` }" />
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import KanNav from '../components/KanNav.vue'
import { COLUMNS, daysLeft, deadlineLabel, kanApi, type Project, type Task } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date } from '../../../lib/format'

const usersStore = useUsersStore()
const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const error = ref<string | null>(null)
const projectsById = computed(() => new Map(projects.value.map(p => [p.id, p])))
const done = (t: Task) => t.subtasks.filter(s => s.is_completed).length

const groups = computed(() => {
  const open = tasks.value.filter(t => t.deadline && t.column_name !== 'done').sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  return [
    { title: 'Overskredet', dot: 'bg-red-500', text: 'text-red-700', items: open.filter(t => daysLeft(t.deadline!) < 0) },
    { title: 'Inden for 2 dage', dot: 'bg-amber-400', text: 'text-amber-700', items: open.filter(t => daysLeft(t.deadline!) >= 0 && daysLeft(t.deadline!) <= 2) },
    { title: 'Senere', dot: 'bg-stone-300', text: 'text-stone-500', items: open.filter(t => daysLeft(t.deadline!) > 2) },
  ]
})

onMounted(async () => {
  try {
    ;[tasks.value, projects.value] = await Promise.all([kanApi.tasks(), kanApi.projects()])
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>
