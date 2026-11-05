<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-8">
    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!data" class="text-stone-400">Henter …</p>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <router-link to="/savemate" class="text-sm text-stone-500 hover:text-accent">← Alle mål</router-link>
          <h1 class="text-3xl font-bold mt-2">{{ goal.icon }} {{ goal.name }}</h1>
          <p class="text-stone-500 text-sm">{{ owner }} · mål {{ date(goal.target_date) }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="editOpen = true">✎ Rediger</button>
          <ConfirmButton label="Slet mål" @confirm="remove" />
          <button type="button" class="btn-primary" @click="openContribution(null)">+ Indbetaling</button>
        </div>
      </div>

      <div class="panel flex flex-wrap items-center gap-6">
        <ProgressRing :value="goal.progress" :size="112" />
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-6 flex-1">
          <div class="stat">
            <dt>Sparet</dt>
            <dd>{{ money(goal.saved) }}</dd>
          </div>
          <div class="stat">
            <dt>Mangler</dt>
            <dd>{{ money(goal.remaining) }}</dd>
          </div>
          <div class="stat">
            <dt>Mål</dt>
            <dd>{{ money(goal.target_amount) }}</dd>
          </div>
          <div class="stat">
            <dt>Skal spares pr. måned</dt>
            <dd class="text-accent">{{ money(goal.monthly_needed) }}</dd>
          </div>
          <div class="stat">
            <dt>Sparet pr. måned (3 md.)</dt>
            <dd>{{ money(goal.recent_monthly) }}</dd>
          </div>
          <div class="stat">
            <dt>Status</dt>
            <dd><span class="tag !text-sm" :class="STATUS[goal.status].class">{{ STATUS[goal.status].label }}</span></dd>
          </div>
        </dl>
      </div>

      <section v-if="months.length" class="panel">
        <h2 class="section-title">Indbetalt pr. måned</h2>
        <BarList :rows="months" :format="money" />
      </section>

      <section>
        <h2 class="section-title">Indbetalinger</h2>
        <p v-if="!data.contributions.length" class="text-stone-500">Ingen indbetalinger endnu.</p>
        <ul v-else class="panel !p-0 divide-y divide-stone-100">
          <li v-for="c in data.contributions" :key="c.id" class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span class="text-stone-500 w-24 shrink-0">{{ date(c.contribution_date) }}</span>
            <span class="tag" :class="c.amount < 0 ? 'bg-red-50 text-red-700' : c.is_lump_sum ? 'bg-amber-50 text-amber-700' : 'bg-accent-soft text-accent'">
              {{ c.amount < 0 ? 'Hævning' : c.is_lump_sum ? 'Engangsbeløb' : 'Fast' }}
            </span>
            <span class="flex-1 truncate">{{ c.description || '' }}</span>
            <strong class="tabular-nums" :class="gainClass(c.amount)">{{ signed(c.amount) }}</strong>
            <button type="button" class="btn-icon" aria-label="Rediger" @click="openContribution(c)">✎</button>
            <ConfirmButton @confirm="removeContribution(c.id)" />
          </li>
        </ul>
      </section>

      <Modal :open="editOpen" title="Rediger mål" @close="editOpen = false">
        <GoalForm v-if="editOpen" :goal="goal" @saved="editOpen = false; load()" @cancel="editOpen = false" />
      </Modal>
      <Modal :open="cOpen" :title="editingC ? 'Rediger indbetaling' : 'Ny indbetaling'" @close="cOpen = false">
        <ContributionForm v-if="cOpen" :goal-id="goal.id" :contribution="editingC" @saved="cOpen = false; load()" @cancel="cOpen = false" />
      </Modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import BarList from '../../../components/BarList.vue'
import ProgressRing from '../components/ProgressRing.vue'
import GoalForm from '../components/GoalForm.vue'
import ContributionForm from '../components/ContributionForm.vue'
import { STATUS, saveApi, type Contribution } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date, gainClass, money, signed } from '../../../lib/format'

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const route = useRoute()
const router = useRouter()
const usersStore = useUsersStore()
const goalId = computed(() => Number(route.params.goalId))
const data = ref<Awaited<ReturnType<typeof saveApi.goal>> | null>(null)
const error = ref<string | null>(null)
const goal = computed(() => data.value!.goal)
const owner = computed(() => (goal.value.owner_id == null ? 'Fælles' : usersStore.byId(goal.value.owner_id)?.username ?? '?'))

/** Netto pr. måned for de seneste 12 måneder med indbetalinger. */
const months = computed(() => {
  const map = new Map<string, number>()
  for (const c of data.value?.contributions ?? []) {
    const key = c.contribution_date.slice(0, 7)
    map.set(key, (map.get(key) ?? 0) + c.amount)
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
    .map(([key, value]) => ({ label: `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, value }))
})

async function load() {
  try {
    data.value = await saveApi.goal(goalId.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)

const editOpen = ref(false)
async function remove() {
  await saveApi.deleteGoal(goalId.value)
  router.push('/savemate')
}

const cOpen = ref(false)
const editingC = ref<Contribution | null>(null)
function openContribution(c: Contribution | null) {
  editingC.value = c
  cOpen.value = true
}
async function removeContribution(id: number) {
  await saveApi.deleteContribution(id)
  await load()
}
</script>
