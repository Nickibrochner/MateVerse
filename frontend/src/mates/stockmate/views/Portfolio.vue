<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="flex gap-1 mb-2">
          <router-link
            v-for="u in usersStore.users"
            :key="u.id"
            :to="`/stockmate/portfolio/${u.id}`"
            class="tag !text-xs"
            :class="u.id === userId ? 'bg-accent text-white' : 'bg-white border border-stone-200 text-stone-500 hover:text-accent'"
          >{{ u.username }}</router-link>
        </div>
        <h1 class="text-3xl font-bold">{{ data?.user.username ?? '…' }}s portefølje</h1>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" :disabled="loading" @click="refresh">
          {{ loading ? 'Henter …' : '↻ Opdater kurser' }}
        </button>
        <router-link :to="`/stockmate/portfolio/${userId}/ny`" class="btn-primary">+ Ny transaktion</router-link>
      </div>
    </div>

    <p v-if="error" class="panel text-loss">{{ error }}</p>

    <template v-if="data">
      <dl class="panel grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="stat">
          <dt>Samlet værdi</dt>
          <dd>{{ money(data.totals.value_dkk) }}</dd>
        </div>
        <div class="stat">
          <dt>Kostpris</dt>
          <dd>{{ money(data.totals.cost_dkk) }}</dd>
        </div>
        <div class="stat">
          <dt>Urealiseret gevinst/tab</dt>
          <dd :class="gainClass(data.totals.unrealized_dkk)">{{ signed(data.totals.unrealized_dkk) }}</dd>
        </div>
        <div class="stat">
          <dt>Realiseret gevinst/tab</dt>
          <dd :class="gainClass(data.totals.realized_dkk)">{{ signed(data.totals.realized_dkk) }}</dd>
        </div>
        <p v-if="data.totals.missing_prices" class="col-span-full text-xs text-amber-700 -mt-2">
          Kursen kunne ikke hentes for {{ data.totals.missing_prices }} {{ data.totals.missing_prices === 1 ? 'aktie' : 'aktier' }}, så de tæller ikke med i værdien.
        </p>
      </dl>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="section-title !mb-0">Udvikling</h2>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in SNAPSHOT_PERIODS"
              :key="p.days"
              type="button"
              class="tag !text-xs"
              :class="snapshotDays === p.days ? 'bg-accent text-white' : 'bg-white border border-stone-200 text-stone-500 hover:text-accent'"
              @click="loadSnapshots(p.days)"
            >{{ p.label }}</button>
          </div>
        </div>
        <div class="panel">
          <LineChart :points="snapshotPoints" empty-text="Ingen historik endnu — kom tilbage i morgen for at se udviklingen." />
        </div>
      </section>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="section-title !mb-0">Beholdninger</h2>
          <div v-if="depots.length > 1" class="flex flex-wrap gap-1">
            <button
              v-for="d in ['', ...depots]"
              :key="d"
              type="button"
              class="tag !text-xs"
              :class="depotFilter === d ? 'bg-accent text-white' : 'bg-white border border-stone-200 text-stone-500 hover:text-accent'"
              @click="depotFilter = d"
            >{{ d || 'Alle depoter' }}</button>
          </div>
        </div>
        <div class="panel !p-0 overflow-x-auto">
          <p v-if="!holdings.length" class="p-5 text-stone-500">Ingen aktier i beholdning endnu.</p>
          <table v-else class="table">
            <thead>
              <tr>
                <th>Aktie</th>
                <th>Depot</th>
                <th class="num">Antal</th>
                <th class="num">Gns. købspris</th>
                <th class="num">Aktuel kurs</th>
                <th class="num">Værdi (DKK)</th>
                <th class="num">Urealiseret (DKK)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in holdings" :key="h.key" class="cursor-pointer hover:bg-stone-50" @click="openHistory(h.stock.ticker)">
                <td>
                  <a :href="`https://www.bing.com/search?q=${encodeURIComponent(h.stock.ticker)}+stock`" target="_blank" rel="noopener" class="font-semibold hover:text-accent" @click.stop>
                    {{ h.stock.ticker }}
                  </a>
                  <div class="text-xs text-stone-400 max-w-[16rem] truncate">{{ h.stock.name ?? h.stock.currency }}</div>
                </td>
                <td class="text-stone-500">{{ h.depot_type }}</td>
                <td class="num">{{ quantity(h.quantity) }}</td>
                <td class="num">{{ money(h.avg_cost_dkk) }}</td>
                <td class="num">
                  {{ money(h.price, h.stock.currency) }}
                  <div v-if="h.price_source === 'cache'" class="text-[11px] text-amber-700">sidst kendte kurs</div>
                  <div v-else-if="h.stock.currency !== 'DKK' && h.price_dkk != null" class="text-xs text-stone-400">{{ money(h.price_dkk) }}</div>
                </td>
                <td class="num font-semibold">{{ money(h.value_dkk) }}</td>
                <td class="num" :class="gainClass(h.unrealized_dkk)">
                  {{ signed(h.unrealized_dkk) }}
                  <div class="text-xs">{{ percent(h.unrealized_pct) }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="section-title">Transaktioner</h2>
        <div class="panel !p-0 overflow-x-auto">
          <p v-if="!data.transactions.length" class="p-5 text-stone-500">Ingen transaktioner registreret endnu.</p>
          <table v-else class="table">
            <thead>
              <tr>
                <th>Dato</th>
                <th>Type</th>
                <th>Aktie</th>
                <th>Depot</th>
                <th class="num">Antal</th>
                <th class="num">Kurs</th>
                <th class="num">Kurtage</th>
                <th class="num">Total (DKK)</th>
                <th class="num">Realiseret (DKK)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in data.transactions" :key="t.id" :class="t.error && 'bg-red-50'">
                <td>{{ date(t.transaction_date) }}</td>
                <td>
                  <span class="tag" :class="t.type === 'Buy' ? 'bg-accent-soft text-accent' : 'bg-amber-50 text-amber-700'">
                    {{ t.type === 'Buy' ? 'Køb' : 'Salg' }}
                  </span>
                </td>
                <td class="font-semibold">{{ t.ticker }}</td>
                <td class="text-stone-500">{{ t.depot_type }}</td>
                <td class="num">{{ quantity(t.quantity) }}</td>
                <td class="num">{{ money(t.price_per_share, t.currency) }}</td>
                <td class="num text-stone-500">{{ money(t.brokerage_fee, t.currency) }}</td>
                <td class="num">{{ money(t.total_dkk) }}</td>
                <td class="num" :class="gainClass(t.realized_dkk)">
                  {{ t.type === 'Sell' ? signed(t.realized_dkk) : '' }}
                  <div v-if="t.error" class="text-xs text-loss">{{ t.error }}</div>
                </td>
                <td class="text-right">
                  <router-link :to="`/stockmate/transaktion/${t.id}`" class="btn-icon inline-grid" title="Rediger" aria-label="Rediger">✎</router-link>
                  <button
                    type="button"
                    class="btn-icon inline-grid"
                    :class="pendingDelete === t.id && '!bg-loss !text-white'"
                    :title="pendingDelete === t.id ? 'Klik igen for at slette' : 'Slet'"
                    :aria-label="pendingDelete === t.id ? 'Bekræft sletning' : 'Slet'"
                    @click="remove(t.id)"
                  >🗑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="deleteError" class="text-loss text-sm mt-2">{{ deleteError }}</p>
      </section>
    </template>

    <Modal :open="!!historyTicker" :title="`${historyTicker} — historisk kurs`" wide @close="historyTicker = null">
      <div class="flex flex-wrap gap-1 mb-3">
        <button
          v-for="p in PRICE_PERIODS"
          :key="p.period"
          type="button"
          class="tag !text-xs"
          :class="historyPeriod === p.period ? 'bg-accent text-white' : 'bg-white border border-stone-200 text-stone-500 hover:text-accent'"
          @click="loadHistory(p.period)"
        >{{ p.label }}</button>
      </div>
      <p v-if="historyLoading" class="text-stone-500 py-6 text-center">Henter …</p>
      <LineChart v-else :points="historyPoints" :color="historyColor" empty-text="Ingen kursdata fundet for perioden." />
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { stockmateApi, type Portfolio } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date, gainClass, money, percent, quantity, signed } from '../../../lib/format'
import Modal from '../../../components/Modal.vue'
import LineChart from '../components/LineChart.vue'

const route = useRoute()
const usersStore = useUsersStore()
usersStore.load()

const userId = computed(() => Number(route.params.userId))
const data = ref<Portfolio | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const depotFilter = ref('')
const pendingDelete = ref<number | null>(null)
const deleteError = ref<string | null>(null)

// ── Porteføljens udvikling over tid ──
const SNAPSHOT_PERIODS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Å', days: 365 },
]
const snapshotDays = ref(90)
const snapshotPoints = ref<{ label: string; value: number }[]>([])

async function loadSnapshots(days: number) {
  snapshotDays.value = days
  try {
    const snapshots = await stockmateApi.snapshots(userId.value, days)
    snapshotPoints.value = snapshots.map(s => ({
      label: new Date(s.snapshot_date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }),
      value: s.total_value_dkk,
    }))
  } catch {
    snapshotPoints.value = []
  }
}

// ── Historisk kurs for en enkelt aktie ──
const PRICE_PERIODS = [
  { label: '1M', period: '1mo' },
  { label: '3M', period: '3mo' },
  { label: '6M', period: '6mo' },
  { label: '1Å', period: '1y' },
  { label: '5Å', period: '5y' },
]
const historyTicker = ref<string | null>(null)
const historyPeriod = ref('3mo')
const historyLoading = ref(false)
const historyPoints = ref<{ label: string; value: number }[]>([])
const historyColor = ref('#0078D4')

async function openHistory(ticker: string) {
  historyTicker.value = ticker
  await loadHistory('3mo')
}

async function loadHistory(period: string) {
  historyPeriod.value = period
  historyLoading.value = true
  try {
    const prices = await stockmateApi.history(historyTicker.value!, period)
    historyPoints.value = prices.map(p => ({
      label: new Date(p.timestamp * 1000).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }),
      value: p.close,
    }))
    historyColor.value = prices.length > 1 && prices[prices.length - 1].close < prices[0].close ? '#dc2626' : '#16a34a'
  } catch {
    historyPoints.value = []
  } finally {
    historyLoading.value = false
  }
}

const depots = computed(() => [...new Set(data.value?.holdings.map(h => h.depot_type) ?? [])].sort())
const holdings = computed(() =>
  (data.value?.holdings ?? [])
    .filter(h => !depotFilter.value || h.depot_type === depotFilter.value)
    .sort((a, b) => (b.value_dkk ?? 0) - (a.value_dkk ?? 0)))

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await stockmateApi.portfolio(userId.value)
    await loadSnapshots(snapshotDays.value) // portfolio-kaldet gemmer dagens snapshot server-side
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await stockmateApi.refresh().catch(() => {})
  await load()
}

/** Første klik markerer, andet klik sletter – som på DND Vaults dashboard. */
async function remove(id: number) {
  deleteError.value = null
  if (pendingDelete.value !== id) {
    pendingDelete.value = id
    return
  }
  pendingDelete.value = null
  try {
    await stockmateApi.deleteTransaction(id)
    await load()
  } catch (e) {
    deleteError.value = (e as Error).message
  }
}

watch(userId, () => {
  depotFilter.value = ''
  load()
}, { immediate: true })
</script>
