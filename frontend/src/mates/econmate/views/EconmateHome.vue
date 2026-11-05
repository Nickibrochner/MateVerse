<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Econmate</h1>
        <p class="text-stone-500 mt-1">Faste budgetter og projekter med fordeling af udgifter.</p>
      </div>
      <button type="button" class="btn-primary" @click="openForm">+ Ny begivenhed</button>
    </div>

    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!events" class="text-stone-400">Henter …</p>

    <template v-else>
      <section v-for="group in groups" :key="group.type">
        <h2 class="section-title">{{ group.title }}</h2>
        <p v-if="!group.items.length" class="text-stone-400 text-sm">{{ group.empty }}</p>
        <ul v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <li v-for="e in group.items" :key="e.id">
            <router-link :to="`/econmate/${e.id}`" class="panel block h-full hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div class="flex items-start gap-3">
                <span class="text-2xl">{{ e.event_type === 'budget' ? '📊' : '🔨' }}</span>
                <div class="min-w-0 flex-1">
                  <div class="font-display text-lg font-bold truncate group-hover:text-accent">{{ e.name }}</div>
                  <div class="text-sm text-stone-500">{{ names(e.member_ids) }}</div>
                  <div v-if="e.start_date || e.end_date" class="text-xs text-stone-400 mt-0.5">
                    {{ e.start_date ? date(e.start_date) : '' }}{{ e.end_date ? ` → ${date(e.end_date)}` : '' }}
                  </div>
                </div>
              </div>
              <div class="mt-4 text-sm border-t border-stone-100 pt-3 flex justify-between">
                <span class="text-stone-500">{{ e.event_type === 'budget' ? 'Pr. måned' : 'I alt' }}</span>
                <strong class="tabular-nums">{{ money(e.event_type === 'budget' ? e.monthly_total : e.total) }}</strong>
              </div>
              <div v-if="e.event_type === 'project' && e.budget_amount > 0" class="mt-2">
                <div class="h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div class="h-full rounded-full" :class="(e.total ?? 0) > e.budget_amount ? 'bg-loss' : 'bg-accent'"
                       :style="{ width: `${Math.min(100, ((e.total ?? 0) / e.budget_amount) * 100)}%` }" />
                </div>
                <div class="text-xs text-stone-400 mt-1">Budget {{ money(e.budget_amount) }}</div>
              </div>
            </router-link>
          </li>
        </ul>
      </section>
    </template>

    <Modal :open="showForm" title="Ny begivenhed" @close="showForm = false">
      <EventForm :initial="null" @saved="onSaved" @cancel="showForm = false" />
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import EventForm from '../components/EventForm.vue'
import { econApi, type EconEvent } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date, money } from '../../../lib/format'

const router = useRouter()
const usersStore = useUsersStore()
const events = ref<EconEvent[] | null>(null)
const error = ref<string | null>(null)
const showForm = ref(false)

const groups = computed(() => [
  { type: 'budget', title: 'Budgetter', empty: 'Ingen budgetter endnu.', items: events.value?.filter(e => e.event_type === 'budget') ?? [] },
  { type: 'project', title: 'Projekter', empty: 'Ingen projekter endnu.', items: events.value?.filter(e => e.event_type === 'project') ?? [] },
])

const names = (ids: number[]) => ids.map(id => usersStore.byId(id)?.username ?? '?').join(', ')

function openForm() {
  showForm.value = true
}

function onSaved(e: EconEvent) {
  showForm.value = false
  router.push(`/econmate/${e.id}`)
}

onMounted(async () => {
  usersStore.load()
  try {
    events.value = await econApi.events()
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>
