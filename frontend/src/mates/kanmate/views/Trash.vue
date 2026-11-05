<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="text-3xl font-bold">Papirkurv</h1>
      <button v-if="trash.projects.length || trash.tasks.length" type="button" class="btn-secondary" :class="confirmEmpty && '!bg-loss !text-white !border-loss'" @click="empty">
        {{ confirmEmpty ? 'Klik igen – sletter permanent' : 'Tøm papirkurven' }}
      </button>
    </div>
    <KanNav />
    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!trash.projects.length && !trash.tasks.length" class="text-stone-500">Papirkurven er tom.</p>

    <section v-if="trash.projects.length">
      <h2 class="section-title">Projekter</h2>
      <ul class="panel !p-0 divide-y divide-stone-100">
        <li v-for="p in trash.projects" :key="p.id" class="flex items-center gap-3 px-4 py-3">
          <span class="w-3 h-3 rounded-full" :style="{ background: p.color }" />
          <span class="font-semibold flex-1">{{ p.name }}</span>
          <span class="text-xs text-stone-400">Slettet {{ date(p.deleted_at!.slice(0, 10)) }}</span>
          <button type="button" class="btn-secondary !py-1 !text-xs" @click="run(() => kanApi.restoreProject(p.id))">↩ Gendan</button>
        </li>
      </ul>
      <p class="text-xs text-stone-400 mt-2">Projektets opgaver kommer tilbage sammen med projektet.</p>
    </section>

    <section v-if="trash.tasks.length">
      <h2 class="section-title">Opgaver</h2>
      <ul class="panel !p-0 divide-y divide-stone-100">
        <li v-for="t in trash.tasks" :key="t.id" class="flex items-center gap-3 px-4 py-3">
          <span class="font-semibold flex-1">{{ t.title }}</span>
          <span class="text-xs text-stone-400">Slettet {{ date(t.deleted_at!.slice(0, 10)) }}</span>
          <button type="button" class="btn-secondary !py-1 !text-xs" @click="run(() => kanApi.restoreTask(t.id))">↩ Gendan</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import KanNav from '../components/KanNav.vue'
import { kanApi, type Project, type Task } from '../api'
import { date } from '../../../lib/format'

const trash = ref<{ projects: Project[]; tasks: Task[] }>({ projects: [], tasks: [] })
const error = ref<string | null>(null)
const confirmEmpty = ref(false)

async function load() {
  try {
    trash.value = await kanApi.trash()
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function run(fn: () => Promise<unknown>) {
  await fn()
  await load()
}
async function empty() {
  if (!confirmEmpty.value) {
    confirmEmpty.value = true
    return
  }
  confirmEmpty.value = false
  await run(() => kanApi.emptyTrash())
}
onMounted(load)
</script>
