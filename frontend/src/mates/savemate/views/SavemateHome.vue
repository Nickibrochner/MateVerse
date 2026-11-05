<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Savemate</h1>
        <p class="text-stone-500 mt-1">Opsparingsmål med faste indbetalinger og engangsbeløb.</p>
      </div>
      <button type="button" class="btn-primary" @click="goalOpen = true">+ Nyt mål</button>
    </div>

    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!data" class="text-stone-400">Henter …</p>

    <template v-else>
      <dl class="panel grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="stat">
          <dt>Skal spares op pr. måned</dt>
          <dd class="text-accent">{{ money(data.totals.monthly_needed) }}</dd>
        </div>
        <div class="stat">
          <dt>Sparet i alt</dt>
          <dd>{{ money(data.totals.saved) }}</dd>
        </div>
        <div class="stat">
          <dt>Samlede mål</dt>
          <dd>{{ money(data.totals.target) }}</dd>
        </div>
        <div class="stat">
          <dt>Generelle engangsbeløb</dt>
          <dd>{{ money(data.totals.general) }}</dd>
        </div>
      </dl>

      <section>
        <h2 class="section-title">Mål</h2>
        <p v-if="!data.goals.length" class="text-stone-500">Ingen mål endnu. Opret det første.</p>
        <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <li v-for="g in data.goals" :key="g.id">
            <router-link :to="`/savemate/${g.id}`" class="panel h-full flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div class="flex items-center gap-3">
                <ProgressRing :value="g.progress" />
                <div class="min-w-0">
                  <div class="font-display text-lg font-bold truncate group-hover:text-accent">{{ g.icon }} {{ g.name }}</div>
                  <div class="text-xs text-stone-500">{{ owner(g.owner_id) }} · {{ date(g.target_date) }}</div>
                </div>
              </div>
              <div class="text-sm flex justify-between">
                <span class="tabular-nums">{{ money(g.saved) }} <span class="text-stone-400">/ {{ money(g.target_amount) }}</span></span>
              </div>
              <div class="flex items-center justify-between gap-2 mt-auto border-t border-stone-100 pt-3 text-sm">
                <span class="tag" :class="STATUS[g.status].class">{{ STATUS[g.status].label }}</span>
                <span v-if="g.monthly_needed > 0" class="tabular-nums text-stone-600">{{ money(g.monthly_needed) }}/md.</span>
              </div>
            </router-link>
          </li>
        </ul>
      </section>

      <section class="max-w-2xl">
        <div class="flex items-center justify-between mb-3">
          <h2 class="section-title !mb-0">Generelle engangsbeløb</h2>
          <button type="button" class="btn-secondary !py-1 !text-xs" @click="openLump(null)">+ Tilføj</button>
        </div>
        <p class="text-sm text-stone-500 mb-3">Penge sat til side uden et bestemt mål. De trækkes fra det samlede månedlige behov.</p>
        <ul v-if="data.general_lump_sums.length" class="panel !p-0 divide-y divide-stone-100">
          <li v-for="c in data.general_lump_sums" :key="c.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span class="text-stone-500 w-24 shrink-0">{{ date(c.contribution_date) }}</span>
            <span class="flex-1 truncate">{{ c.description || '–' }}</span>
            <strong class="tabular-nums">{{ money(c.amount) }}</strong>
            <button type="button" class="btn-icon" aria-label="Rediger" @click="openLump(c)">✎</button>
            <ConfirmButton @confirm="removeLump(c.id)" />
          </li>
        </ul>
      </section>
    </template>

    <Modal :open="goalOpen" title="Nyt opsparingsmål" @close="goalOpen = false">
      <GoalForm v-if="goalOpen" :goal="null" @saved="g => router.push(`/savemate/${g.id}`)" @cancel="goalOpen = false" />
    </Modal>
    <Modal :open="lumpOpen" :title="editingLump ? 'Rediger engangsbeløb' : 'Generelt engangsbeløb'" @close="lumpOpen = false">
      <ContributionForm v-if="lumpOpen" :goal-id="null" :contribution="editingLump" @saved="lumpOpen = false; load()" @cancel="lumpOpen = false" />
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import ProgressRing from '../components/ProgressRing.vue'
import GoalForm from '../components/GoalForm.vue'
import ContributionForm from '../components/ContributionForm.vue'
import { STATUS, saveApi, type Contribution } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date, money } from '../../../lib/format'

const router = useRouter()
const usersStore = useUsersStore()
const data = ref<Awaited<ReturnType<typeof saveApi.overview>> | null>(null)
const error = ref<string | null>(null)
const goalOpen = ref(false)
const lumpOpen = ref(false)
const editingLump = ref<Contribution | null>(null)

const owner = (id: number | null) => (id == null ? 'Fælles' : usersStore.byId(id)?.username ?? '?')

async function load() {
  try {
    data.value = await saveApi.overview()
  } catch (e) {
    error.value = (e as Error).message
  }
}
function openLump(c: Contribution | null) {
  editingLump.value = c
  lumpOpen.value = true
}
async function removeLump(id: number) {
  await saveApi.deleteContribution(id)
  await load()
}
onMounted(load)
</script>
