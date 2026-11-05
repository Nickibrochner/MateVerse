<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <h1 class="text-3xl font-bold">Arkiv</h1>
    <KanNav />
    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!tasks.length" class="text-stone-500">Arkivet er tomt. Færdige opgaver kan arkiveres fra boardet.</p>
    <ul v-else class="panel !p-0 divide-y divide-stone-100">
      <li v-for="t in tasks" :key="t.id" class="flex items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="font-semibold">{{ t.title }}</div>
          <div class="text-xs text-stone-500">
            Arkiveret {{ date(t.archived_at!.slice(0, 10)) }}
            <template v-if="t.project_id != null"> · {{ projectName(t.project_id) }}</template>
          </div>
        </div>
        <button type="button" class="btn-secondary !py-1 !text-xs" @click="restore(t.id)">↩ Tilbage på boardet</button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import KanNav from '../components/KanNav.vue'
import { kanApi, type Project, type Task } from '../api'
import { date } from '../../../lib/format'

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const error = ref<string | null>(null)
const projectName = (id: number) => projects.value.find(p => p.id === id)?.name ?? ''

async function load() {
  try {
    ;[tasks.value, projects.value] = await Promise.all([kanApi.archive(), kanApi.projects()])
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function restore(id: number) {
  await kanApi.unarchiveTask(id)
  await load()
}
onMounted(load)
</script>
