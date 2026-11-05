<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!data" class="text-stone-400">Henter …</p>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <router-link to="/econmate" class="text-sm text-stone-500 hover:text-accent">← Alle begivenheder</router-link>
          <h1 class="text-3xl font-bold mt-2 flex items-center gap-3">
            {{ ev.name }}
            <span class="tag bg-accent-soft text-accent">{{ isBudget ? 'Budget' : 'Projekt' }}</span>
          </h1>
          <p class="text-stone-500 text-sm">
            {{ ev.member_ids.map(name).join(', ') }}
            <template v-if="ev.start_date || ev.end_date"> · {{ ev.start_date ? date(ev.start_date) : '' }}{{ ev.end_date ? ` → ${date(ev.end_date)}` : '' }}</template>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" @click="exportCsv">↓ CSV</button>
          <button type="button" class="btn-secondary" @click="showEdit = true">✎ Rediger</button>
          <ConfirmButton label="Slet begivenhed" @confirm="removeEvent" />
          <button type="button" class="btn-primary" @click="newExpense">+ Udgift</button>
        </div>
      </div>

      <!-- Nøgletal -->
      <dl class="panel grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="stat">
          <dt>{{ isBudget ? 'Udgifter pr. måned' : 'Samlede udgifter' }}</dt>
          <dd>{{ money(isBudget ? sum.monthly_total : sum.total) }}</dd>
        </div>
        <div v-if="!isBudget && ev.budget_amount > 0" class="stat">
          <dt>Tilbage af budget</dt>
          <dd :class="gainClass(ev.budget_amount - sum.total)">{{ money(ev.budget_amount - sum.total) }}</dd>
        </div>
        <div v-for="m in sum.members" :key="m.user_id" class="stat">
          <dt>{{ name(m.user_id) }} {{ isBudget ? 'pr. måned' : 'har lagt ud' }}</dt>
          <dd>{{ money(isBudget ? m.monthly : m.paid) }}</dd>
        </div>
      </dl>

      <!-- Udligning (projekter) -->
      <section v-if="!isBudget" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="panel">
          <h2 class="section-title">Status</h2>
          <ul class="space-y-2">
            <li v-for="m in sum.members" :key="m.user_id" class="flex justify-between text-sm">
              <span class="font-semibold">{{ name(m.user_id) }}</span>
              <span :class="gainClass(m.balance)">
                {{ m.balance > 0.005 ? `Skal have ${money(m.balance)}` : m.balance < -0.005 ? `Skylder ${money(-m.balance)}` : 'I balance' }}
              </span>
            </li>
          </ul>
          <template v-if="sum.transfers.length">
            <h3 class="section-title !mt-5">Forslag til udligning</h3>
            <ul class="space-y-2">
              <li v-for="t in sum.transfers" :key="`${t.from}-${t.to}`" class="flex items-center justify-between gap-2 text-sm">
                <span>{{ name(t.from) }} → {{ name(t.to) }}: <strong>{{ money(t.amount) }}</strong></span>
                <button type="button" class="btn-secondary !py-1 !px-2 !text-xs" @click="settle(t.from, t.to, t.amount)">Registrér</button>
              </li>
            </ul>
          </template>
        </div>

        <div class="panel">
          <h2 class="section-title">Udligninger</h2>
          <form class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end mb-4" @submit.prevent="settle(sForm.payer_id, sForm.receiver_id, sForm.amount)">
            <div>
              <label class="label">Betaler</label>
              <select v-model.number="sForm.payer_id" class="field">
                <option v-for="id in ev.member_ids" :key="id" :value="id">{{ name(id) }}</option>
              </select>
            </div>
            <div>
              <label class="label">Modtager</label>
              <select v-model.number="sForm.receiver_id" class="field">
                <option v-for="id in ev.member_ids" :key="id" :value="id">{{ name(id) }}</option>
              </select>
            </div>
            <div>
              <label class="label">Beløb</label>
              <input v-model.number="sForm.amount" type="number" min="0" step="any" class="field">
            </div>
            <button type="submit" class="btn-secondary" :disabled="!sForm.amount || sForm.payer_id === sForm.receiver_id">Tilføj</button>
          </form>
          <p v-if="settleError" class="text-loss text-sm mb-2">{{ settleError }}</p>
          <p v-if="!data.settlements.length" class="text-sm text-stone-400">Ingen udligninger endnu.</p>
          <ul v-else class="divide-y divide-stone-100 text-sm">
            <li v-for="s in data.settlements" :key="s.id" class="flex items-center justify-between py-1.5">
              <span>{{ date(s.settlement_date) }} · {{ name(s.payer_id) }} → {{ name(s.receiver_id) }}</span>
              <span class="flex items-center gap-1">
                <strong class="tabular-nums">{{ money(s.amount) }}</strong>
                <ConfirmButton @confirm="removeSettlement(s.id)" />
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Fordeling (budgetter) -->
      <section v-if="isBudget && data.expenses.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="panel">
          <h2 class="section-title">Pr. kategori (pr. måned)</h2>
          <BarList :rows="sum.categories.map(c => ({ label: c.category, value: c.monthly }))" :format="money" />
        </div>
        <div class="panel">
          <h2 class="section-title">Pr. person (pr. måned)</h2>
          <BarList :rows="sum.members.map(m => ({ label: name(m.user_id), value: m.monthly }))" :format="money" />
          <p class="text-xs text-stone-400 mt-3">Fælles udgifter er fordelt ligeligt.</p>
        </div>
      </section>

      <!-- Udgifter -->
      <section>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="section-title !mb-0">Udgifter</h2>
          <div v-if="data.expenses.length" class="flex flex-wrap gap-2">
            <input v-model="query" class="field !w-56 !py-1.5 text-sm" placeholder="Søg …">
            <select v-model="filterPayer" class="field !w-auto !py-1.5 text-sm">
              <option value="all">Alle betalere</option>
              <option value="shared">Fælles</option>
              <option v-for="id in ev.member_ids" :key="id" :value="String(id)">{{ name(id) }}</option>
            </select>
            <select v-if="isBudget" v-model="filterCategory" class="field !w-auto !py-1.5 text-sm">
              <option value="all">Alle kategorier</option>
              <option v-for="c in usedCategories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="panel !p-0 overflow-x-auto">
          <p v-if="!data.expenses.length" class="p-5 text-stone-500">Ingen udgifter endnu.</p>
          <p v-else-if="!rows.length" class="p-5 text-stone-500">Ingen udgifter matcher.</p>
          <table v-else class="table">
            <thead>
              <tr>
                <th v-for="c in columns" :key="c.key" :class="c.num && 'num'">
                  <button type="button" class="uppercase hover:text-accent" @click="sortBy(c.key)">
                    {{ c.label }}<span v-if="sortKey === c.key">{{ sortDir === 'asc' ? ' ▲' : ' ▼' }}</span>
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in rows" :key="e.id">
                <td class="font-semibold whitespace-normal">{{ e.description }}</td>
                <td v-if="isBudget">{{ e.category ?? '–' }}</td>
                <td v-if="isBudget" class="text-stone-500">{{ e.payment_frequency ?? '–' }}</td>
                <td v-if="isBudget" class="text-stone-500">{{ e.payment_method ?? '–' }}</td>
                <td v-else>{{ date(e.expense_date) }}</td>
                <td>{{ payer(e.paid_by) }}</td>
                <td class="num font-semibold">{{ money(e.amount) }}</td>
                <td v-if="isBudget" class="num text-stone-500">{{ money(monthly(e)) }}</td>
                <td class="text-right">
                  <button type="button" class="btn-icon inline-grid" title="Rediger" aria-label="Rediger" @click="editExpense(e)">✎</button>
                  <ConfirmButton @confirm="removeExpense(e.id)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <Modal :open="showEdit" title="Rediger begivenhed" @close="showEdit = false">
        <EventForm :initial="ev" @saved="showEdit = false; load()" @cancel="showEdit = false" />
      </Modal>

      <Modal :open="expenseOpen" :title="expenseId ? 'Rediger udgift' : 'Ny udgift'" @close="expenseOpen = false">
        <form class="space-y-4" @submit.prevent="saveExpense">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2">
              <label class="label">Beskrivelse</label>
              <input v-model="eForm.description" class="field" required placeholder="Fx Husleje">
            </div>
            <div>
              <label class="label">Beløb (DKK)</label>
              <input v-model.number="eForm.amount" type="number" step="any" class="field" required>
            </div>
            <div>
              <label class="label">Betalt af</label>
              <select v-model="eForm.paid_by" class="field">
                <option :value="null">Fælles (deles ligeligt)</option>
                <option v-for="id in ev.member_ids" :key="id" :value="id">{{ name(id) }}</option>
              </select>
            </div>
            <template v-if="isBudget">
              <div>
                <label class="label">Kategori</label>
                <input v-model="eForm.category" class="field" list="econ-categories" placeholder="Fx Bolig">
                <datalist id="econ-categories">
                  <option v-for="c in allCategories" :key="c" :value="c" />
                </datalist>
              </div>
              <div>
                <label class="label">Frekvens</label>
                <select v-model="eForm.payment_frequency" class="field">
                  <option v-for="f in meta?.frequencies" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
              <div>
                <label class="label">Betalingsform</label>
                <select v-model="eForm.payment_method" class="field">
                  <option :value="null">–</option>
                  <option v-for="m in meta?.payment_methods" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </template>
            <div>
              <label class="label">Dato</label>
              <input v-model="eForm.expense_date" type="date" class="field" required>
            </div>
          </div>
          <p v-if="expenseError" class="text-loss text-sm">{{ expenseError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="expenseOpen = false">Annuller</button>
            <button type="submit" class="btn-primary">Gem</button>
          </div>
        </form>
      </Modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import BarList from '../../../components/BarList.vue'
import EventForm from '../components/EventForm.vue'
import { econApi, type EventDetail, type Expense, type ExpenseInput } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date, gainClass, money, today } from '../../../lib/format'
import { downloadCsv } from '../../../lib/csv'

const MONTHS: Record<string, number> = { 'Månedlig': 1, 'Hver anden måned': 2, 'Kvartalsvis': 3, 'Halvårlig': 6, 'Årlig': 12 }
const monthly = (e: Expense) => e.amount / (MONTHS[e.payment_frequency ?? ''] ?? 1)

const route = useRoute()
const router = useRouter()
const usersStore = useUsersStore()
const eventId = computed(() => Number(route.params.eventId))

const data = ref<EventDetail | null>(null)
const meta = ref<{ frequencies: string[]; payment_methods: string[]; categories: string[] } | null>(null)
const error = ref<string | null>(null)
const ev = computed(() => data.value!.event)
const sum = computed(() => data.value!.summary)
const isBudget = computed(() => ev.value.event_type === 'budget')

const name = (id: number) => usersStore.byId(id)?.username ?? '?'
const payer = (id: number | null) => (id == null ? 'Fælles' : name(id))

async function load() {
  try {
    data.value = await econApi.event(eventId.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(async () => {
  econApi.meta().then(m => (meta.value = m)).catch(() => {})
  await load()
})

// ── Rediger og slet begivenhed ──
const showEdit = ref(false)
async function removeEvent() {
  await econApi.deleteEvent(eventId.value)
  router.push('/econmate')
}

// ── Udgifter ──
const expenseOpen = ref(false)
const expenseId = ref<number | null>(null)
const expenseError = ref<string | null>(null)
const emptyExpense = (): ExpenseInput => ({
  description: '', amount: 0, paid_by: null, category: null, expense_date: today(),
  payment_frequency: data.value?.event.event_type === 'budget' ? 'Månedlig' : null, payment_method: null,
})
const eForm = reactive<ExpenseInput>(emptyExpense())
const allCategories = computed(() => [...new Set([...(meta.value?.categories ?? []), ...usedCategories.value])])

function newExpense() {
  Object.assign(eForm, emptyExpense())
  expenseId.value = null
  expenseError.value = null
  expenseOpen.value = true
}
function editExpense(e: Expense) {
  const { id: _id, event_id: _ev, ...rest } = e
  Object.assign(eForm, rest)
  expenseId.value = e.id
  expenseError.value = null
  expenseOpen.value = true
}
async function saveExpense() {
  try {
    if (expenseId.value) await econApi.updateExpense(expenseId.value, { ...eForm })
    else await econApi.createExpense(eventId.value, { ...eForm })
    expenseOpen.value = false
    await load()
  } catch (e) {
    expenseError.value = (e as Error).message
  }
}
async function removeExpense(id: number) {
  await econApi.deleteExpense(id)
  await load()
}

// ── Udligninger ──
const sForm = reactive({ payer_id: 0, receiver_id: 0, amount: 0 })
const settleError = ref<string | null>(null)
watch(() => data.value?.event.member_ids, ids => {
  if (ids && !ids.includes(sForm.payer_id)) sForm.payer_id = ids[0] ?? 0
  if (ids && !ids.includes(sForm.receiver_id)) sForm.receiver_id = ids[1] ?? ids[0] ?? 0
})
async function settle(payer_id: number, receiver_id: number, amount: number) {
  settleError.value = null
  try {
    await econApi.createSettlement(eventId.value, { payer_id, receiver_id, amount, settlement_date: today() })
    sForm.amount = 0
    await load()
  } catch (e) {
    settleError.value = (e as Error).message
  }
}
async function removeSettlement(id: number) {
  await econApi.deleteSettlement(id)
  await load()
}

// ── Søgning, filtre og sortering ──
type SortKey = 'description' | 'category' | 'payment_frequency' | 'payment_method' | 'expense_date' | 'paid_by' | 'amount' | 'monthly'
const query = ref('')
const filterPayer = ref('all')
const filterCategory = ref('all')
const sortKey = ref<SortKey>('amount')
const sortDir = ref<'asc' | 'desc'>('desc')

const columns = computed(() => {
  const cols: { key: SortKey; label: string; num?: boolean }[] = [{ key: 'description', label: 'Beskrivelse' }]
  if (isBudget.value) cols.push({ key: 'category', label: 'Kategori' }, { key: 'payment_frequency', label: 'Frekvens' }, { key: 'payment_method', label: 'Betaling' })
  else cols.push({ key: 'expense_date', label: 'Dato' })
  cols.push({ key: 'paid_by', label: 'Betalt af' }, { key: 'amount', label: 'Beløb', num: true })
  if (isBudget.value) cols.push({ key: 'monthly', label: 'Pr. måned', num: true })
  return cols
})
const usedCategories = computed(() =>
  [...new Set(data.value?.expenses.map(e => e.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'da')))

function sortBy(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = key === 'amount' || key === 'monthly' || key === 'expense_date' ? 'desc' : 'asc'
  }
}

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const value = (e: Expense): string | number =>
    sortKey.value === 'monthly' ? monthly(e) : sortKey.value === 'paid_by' ? payer(e.paid_by) : (e[sortKey.value] ?? '')
  return (data.value?.expenses ?? [])
    .filter(e => filterPayer.value === 'all' || (filterPayer.value === 'shared' ? e.paid_by == null : String(e.paid_by) === filterPayer.value))
    .filter(e => filterCategory.value === 'all' || e.category === filterCategory.value)
    .filter(e => !q || [e.description, e.category, payer(e.paid_by)].some(s => s?.toLowerCase().includes(q)))
    .sort((a, b) => {
      const x = value(a), y = value(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'da')
      return sortDir.value === 'asc' ? c : -c
    })
})

function exportCsv() {
  const header = isBudget.value
    ? ['Beskrivelse', 'Kategori', 'Frekvens', 'Betalingsform', 'Betalt af', 'Beløb', 'Pr. måned']
    : ['Dato', 'Beskrivelse', 'Betalt af', 'Beløb']
  const body = data.value!.expenses.map(e => isBudget.value
    ? [e.description, e.category ?? '', e.payment_frequency ?? '', e.payment_method ?? '', payer(e.paid_by), e.amount, monthly(e)]
    : [e.expense_date, e.description, payer(e.paid_by), e.amount])
  downloadCsv(`${ev.value.name}.csv`, [header, ...body])
}
</script>
