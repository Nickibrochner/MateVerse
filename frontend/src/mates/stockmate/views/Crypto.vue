<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <router-link to="/stockmate" class="text-sm text-stone-500 hover:text-accent">← Tilbage til Stockmate</router-link>
        <h1 class="text-3xl font-bold mt-2">Krypto</h1>
        <p class="text-stone-500 mt-1">Fælles beholdning for husstanden – ikke knyttet til en enkelt person.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" :disabled="syncing" @click="syncAll">
          {{ syncing ? 'Synkroniserer …' : '↻ Synk alt' }}
        </button>
      </div>
    </div>

    <p v-if="syncMessage" class="panel text-sm">{{ syncMessage }}</p>

    <section>
      <h2 class="section-title">Beholdninger</h2>
      <div class="panel !p-0 overflow-x-auto">
        <p v-if="loadingHoldings" class="p-5 text-stone-500">Henter …</p>
        <p v-else-if="!holdings.length" class="p-5 text-stone-500">Ingen krypto-beholdninger endnu – synkronisér Coinbase, importér en Uphold-CSV, eller tjek indstillingerne nedenfor.</p>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Mønt</th>
              <th>Platform</th>
              <th class="num">Antal</th>
              <th class="num">Kurs (USD)</th>
              <th class="num">Værdi (DKK)</th>
              <th>Opdateret</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in holdings" :key="`${h.coin_id}-${h.platform}`" class="cursor-pointer hover:bg-stone-50" @click="openHistory(h)">
              <td>
                <span class="font-semibold">{{ h.symbol }}</span>
                <div class="text-xs text-stone-400">{{ h.name }}</div>
              </td>
              <td class="text-stone-500 capitalize">{{ h.platform }}</td>
              <td class="num">{{ amount(h.amount) }}</td>
              <td class="num">{{ h.last_known_price_usd != null ? money(h.last_known_price_usd, 'USD') : '–' }}</td>
              <td class="num font-semibold">{{ h.last_known_price_dkk != null ? money(h.amount * h.last_known_price_dkk) : '–' }}</td>
              <td class="text-xs text-stone-400">{{ h.last_price_updated ? date(h.last_price_updated.slice(0, 10)) : '–' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 class="section-title">Importér Uphold CSV</h2>
      <div class="panel space-y-3">
        <p class="text-sm text-stone-500">
          Nettosaldo pr. mønt beregnes ud fra gennemførte transaktioner i den eksporterede CSV-fil.
        </p>
        <div>
          <button type="button" class="btn-secondary" :disabled="importing" @click="fileInput?.click()">
            {{ importing ? 'Importerer …' : '📥 Vælg Uphold-CSV' }}
          </button>
          <input ref="fileInput" type="file" accept=".csv,text/csv" style="display: none" @change="importUphold">
        </div>
        <p v-if="importMessage" class="text-sm text-stone-600">{{ importMessage }}</p>
        <p v-if="importError" class="text-loss text-sm">{{ importError }}</p>
      </div>
    </section>

    <section>
      <h2 class="section-title">Coinbase & CoinGecko</h2>
      <div class="panel space-y-4">
        <p class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
          ⚠️ Coinbase-nøglen har handelsrettigheder til din konto og gemmes ukrypteret i databasen.
          Del den aldrig, og brug kun en nøgle med de rettigheder, du er tryg med.
        </p>
        <div v-if="settings" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Coinbase Key Name</label>
            <input v-model="form.coinbase_key_name" class="field" placeholder="organizations/.../apiKeys/...">
          </div>
          <div>
            <label class="label">Coinbase Private Key</label>
            <textarea v-model="form.coinbase_private_key" class="field" rows="3" :placeholder="settings.has_coinbase_private_key ? 'Allerede sat – indtast for at erstatte' : '-----BEGIN EC PRIVATE KEY-----...'"></textarea>
          </div>
          <div class="sm:col-span-2">
            <label class="label">CoinGecko API-nøgle (valgfri)</label>
            <input v-model="form.coingecko_api_key" class="field" :placeholder="settings.has_coingecko_api_key ? 'Allerede sat – indtast for at erstatte' : 'Kun nødvendigt ved mange opslag'">
          </div>
        </div>
        <div class="flex justify-end">
          <button type="button" class="btn-primary" :disabled="savingSettings" @click="saveSettings">
            {{ savingSettings ? 'Gemmer …' : 'Gem nøgler' }}
          </button>
        </div>
        <p v-if="settingsMessage" class="text-sm text-stone-600">{{ settingsMessage }}</p>
      </div>
    </section>

    <Modal :open="!!historyCoin" :title="historyCoin ? `${historyCoin.symbol} — historisk kurs (USD)` : ''" wide @close="historyCoin = null">
      <div class="flex flex-wrap gap-1 mb-3">
        <button
          v-for="p in HISTORY_PERIODS"
          :key="p.days"
          type="button"
          class="tag !text-xs"
          :class="historyDays === p.days ? 'bg-accent text-white' : 'bg-white border border-stone-200 text-stone-500 hover:text-accent'"
          @click="loadHistory(p.days)"
        >{{ p.label }}</button>
      </div>
      <p v-if="historyLoading" class="text-stone-500 py-6 text-center">Henter …</p>
      <LineChart v-else :points="historyPoints" :color="historyColor" empty-text="Ingen kursdata fundet for perioden." />
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { stockmateApi, type CryptoHolding, type CryptoSettings } from '../api'
import { date, money, quantity as amount } from '../../../lib/format'
import Modal from '../../../components/Modal.vue'
import LineChart from '../components/LineChart.vue'

const holdings = ref<CryptoHolding[]>([])
const loadingHoldings = ref(false)
const syncing = ref(false)
const syncMessage = ref('')

const settings = ref<CryptoSettings | null>(null)
const form = reactive({ coinbase_key_name: '', coinbase_private_key: '', coingecko_api_key: '' })
const savingSettings = ref(false)
const settingsMessage = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importMessage = ref('')
const importError = ref('')

const HISTORY_PERIODS = [
  { label: '1M', days: '30' },
  { label: '3M', days: '90' },
  { label: '6M', days: '180' },
  { label: '1Å', days: '365' },
]
const historyCoin = ref<CryptoHolding | null>(null)
const historyDays = ref('90')
const historyLoading = ref(false)
const historyPoints = ref<{ label: string; value: number }[]>([])
const historyColor = ref('#0078D4')

async function loadHoldings() {
  loadingHoldings.value = true
  try {
    holdings.value = await stockmateApi.cryptoHoldings()
  } finally {
    loadingHoldings.value = false
  }
}

async function loadSettings() {
  settings.value = await stockmateApi.cryptoSettings()
  form.coinbase_key_name = settings.value.coinbase_key_name ?? ''
}

async function syncAll() {
  syncing.value = true
  syncMessage.value = ''
  try {
    const result = await stockmateApi.syncAllCrypto()
    const parts: string[] = []
    parts.push('synced' in result.coinbase ? `Coinbase: ${result.coinbase.synced} mønter synkroniseret.` : `Coinbase: ${result.coinbase.error}`)
    parts.push('updated' in result.prices ? `Priser: ${result.prices.updated} opdateret.` : `Priser: ${result.prices.error}`)
    syncMessage.value = parts.join(' ')
    await loadHoldings()
  } catch (e) {
    syncMessage.value = (e as Error).message
  } finally {
    syncing.value = false
  }
}

async function saveSettings() {
  savingSettings.value = true
  settingsMessage.value = ''
  try {
    const body: Record<string, string> = {}
    if (form.coinbase_key_name.trim()) body.coinbase_key_name = form.coinbase_key_name.trim()
    if (form.coinbase_private_key.trim()) body.coinbase_private_key = form.coinbase_private_key.trim()
    if (form.coingecko_api_key.trim()) body.coingecko_api_key = form.coingecko_api_key.trim()
    await stockmateApi.saveCryptoSettings(body)
    form.coinbase_private_key = ''
    form.coingecko_api_key = ''
    await loadSettings()
    settingsMessage.value = 'Gemt.'
  } catch (e) {
    settingsMessage.value = (e as Error).message
  } finally {
    savingSettings.value = false
  }
}

async function importUphold(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  importing.value = true
  importMessage.value = ''
  importError.value = ''
  try {
    const { imported } = await stockmateApi.importUpholdCsv(await file.text())
    importMessage.value = `${imported} mønt(er) opdateret fra CSV-filen.`
    await loadHoldings()
  } catch (e) {
    importError.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

function openHistory(h: CryptoHolding) {
  historyCoin.value = h
  loadHistory('90')
}

async function loadHistory(days: string) {
  if (!historyCoin.value) return
  historyDays.value = days
  historyLoading.value = true
  try {
    const prices = await stockmateApi.cryptoHistory(historyCoin.value.coin_id, days)
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

onMounted(() => {
  loadHoldings()
  loadSettings()
})
</script>
