<template>
  <div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
    <div>
      <router-link :to="backTo" class="text-sm text-stone-500 hover:text-accent">← Tilbage til porteføljen</router-link>
      <h1 class="text-3xl font-bold mt-2">{{ isEdit ? 'Rediger transaktion' : 'Ny transaktion' }}</h1>
      <p v-if="user" class="text-stone-500">{{ user.username }}s portefølje</p>
    </div>

    <p v-if="loadError" class="panel text-loss">{{ loadError }}</p>

    <form v-else class="panel space-y-5" @submit.prevent="save">
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="opt in TYPES"
          :key="opt.id"
          type="button"
          class="btn border"
          :class="form.type === opt.id ? 'bg-accent text-white border-accent' : 'bg-white border-stone-300 text-stone-600 hover:border-accent'"
          @click="form.type = opt.id"
        >{{ opt.label }}</button>
      </div>
      <p v-if="form.type === 'Dividend'" class="text-xs text-stone-500 -mt-3">
        Indtast fx antal aktier som "Antal" og udbytte pr. aktie som "Kurs pr. aktie" – eller 1 og det samlede udbytte.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">
          <label class="label">Aktie (ticker)</label>
          <TickerInput v-model="form.ticker" :known="stocks" @picked="lookup" />
          <p class="text-xs text-stone-500 mt-1 min-h-[1rem]">
            <template v-if="quote?.name">{{ quote.name }} · </template>
            <template v-if="quote?.price != null">Aktuel kurs {{ money(quote.price, quote.currency ?? form.currency) }}</template>
            <template v-else-if="quote">Ingen kurs fundet – tjek tickeren (danske aktier ender på .CO)</template>
          </p>
        </div>

        <div>
          <label class="label">Depot</label>
          <select v-model="form.depot_type" class="field" required>
            <option v-for="d in depotOptions" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <div>
          <label class="label">Dato</label>
          <input v-model="form.transaction_date" type="date" class="field" :max="today()" required>
        </div>

        <div>
          <label class="label">Antal</label>
          <input v-model.number="form.quantity" type="number" min="0" step="any" class="field" required>
        </div>
        <div>
          <label class="label">Kurs pr. aktie</label>
          <div class="flex gap-2">
            <input v-model.number="form.price_per_share" type="number" min="0" step="any" class="field" required>
            <input v-model="form.currency" class="field !w-20 uppercase text-center" maxlength="3" required @change="lookupFx">
          </div>
        </div>

        <div>
          <label class="label">Kurtage ({{ form.currency }})</label>
          <input
            :value="feeValue"
            type="number"
            min="0"
            step="any"
            class="field"
            @input="fee = numberOrNull(($event.target as HTMLInputElement).value)"
          >
          <p class="text-xs text-stone-500 mt-1">
            <template v-if="fee == null">Standard {{ form.type === 'Dividend' ? '0' : rate * 100 }} % af handelsværdien</template>
            <button v-else type="button" class="text-accent hover:underline" @click="fee = null">Brug standard ({{ form.type === 'Dividend' ? '0' : rate * 100 }} %)</button>
          </p>
        </div>
        <div>
          <label class="label">Valutakurs (DKK pr. {{ form.currency }})</label>
          <input
            v-model.number="form.fx_rate"
            type="number"
            min="0"
            step="any"
            class="field"
            :disabled="form.currency === 'DKK'"
            required
          >
          <p class="text-xs text-stone-500 mt-1">Gemmes på transaktionen, så historikken ikke ændrer sig senere.</p>
        </div>

        <div class="sm:col-span-2">
          <label class="label">Note</label>
          <input v-model="form.note" class="field" placeholder="Valgfri">
        </div>
      </div>

      <div class="rounded-lg bg-accent-soft p-4 flex flex-wrap justify-between gap-2 text-sm">
        <span>Handelsværdi <strong class="tabular-nums">{{ money(gross, form.currency) }}</strong></span>
        <span>{{ form.type === 'Buy' ? 'I alt at betale' : 'I alt modtaget' }}
          <strong class="tabular-nums">{{ money(totalDkk) }}</strong>
        </span>
      </div>

      <p v-if="saveError" class="text-loss text-sm">{{ saveError }}</p>

      <div class="flex justify-end gap-2">
        <router-link :to="backTo" class="btn-secondary">Annuller</router-link>
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Gemmer …' : 'Gem transaktion' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TickerInput from '../components/TickerInput.vue'
import { stockmateApi, type Quote, type TxInput, type TxType } from '../api'
import { useUsersStore } from '../../../stores/users'
import { money, today } from '../../../lib/format'

const TYPES: { id: TxType; label: string }[] = [
  { id: 'Buy', label: 'Køb' },
  { id: 'Sell', label: 'Salg' },
  { id: 'Dividend', label: 'Udbytte' },
]

const route = useRoute()
const router = useRouter()
const usersStore = useUsersStore()

const txId = computed(() => (route.params.txId ? Number(route.params.txId) : null))
const isEdit = computed(() => txId.value != null)

const form = reactive<Required<Omit<TxInput, 'brokerage_fee'>>>({
  user_id: Number(route.params.userId) || 0,
  ticker: '',
  depot_type: '',
  type: 'Buy',
  quantity: 0,
  price_per_share: 0,
  currency: 'DKK',
  fx_rate: 1,
  transaction_date: today(),
  note: '',
})
/** null = standardkurtage beregnes ud fra rate. */
const fee = ref<number | null>(null)
const rate = ref(0.01)
const depotTypes = ref<string[]>([])
const stocks = ref<{ ticker: string; name: string | null }[]>([])
const quote = ref<Quote | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saving = ref(false)

const user = computed(() => usersStore.byId(form.user_id))
const backTo = computed(() => `/stockmate/portfolio/${form.user_id}`)
const depotOptions = computed(() =>
  form.depot_type && !depotTypes.value.includes(form.depot_type) ? [form.depot_type, ...depotTypes.value] : depotTypes.value)

const gross = computed(() => (form.quantity || 0) * (form.price_per_share || 0))
const defaultFee = computed(() => (form.type === 'Dividend' ? 0 : Math.round(gross.value * rate.value * 100) / 100))
const feeValue = computed(() => fee.value ?? defaultFee.value)
const totalDkk = computed(() =>
  (gross.value + (form.type === 'Buy' ? feeValue.value : -feeValue.value)) * (form.fx_rate || 0))

const numberOrNull = (v: string) => (v === '' ? null : Number(v))

onMounted(async () => {
  usersStore.load()
  try {
    const [meta, known] = await Promise.all([stockmateApi.meta(), stockmateApi.stocks()])
    depotTypes.value = meta.depot_types
    rate.value = meta.default_brokerage_rate
    stocks.value = known
    if (!form.depot_type) form.depot_type = meta.depot_types[0]

    if (txId.value != null) {
      const tx = await stockmateApi.getTransaction(txId.value)
      Object.assign(form, {
        user_id: tx.user_id,
        ticker: tx.ticker,
        depot_type: tx.depot_type,
        type: tx.type,
        quantity: tx.quantity,
        price_per_share: tx.price_per_share,
        currency: tx.currency,
        fx_rate: tx.fx_rate,
        transaction_date: tx.transaction_date,
        note: tx.note ?? '',
      })
      // Behold en rettet kurtage; matcher den standarden, vises den som standard
      const std = Math.round(tx.quantity * tx.price_per_share * rate.value * 100) / 100
      fee.value = Math.abs(tx.brokerage_fee - std) < 0.005 ? null : tx.brokerage_fee
    }
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

let lastLookup = ''
/** Slår kurs og valuta op, når en ticker vælges – udfylder kun felter, der ikke er rørt. */
async function lookup(ticker: string) {
  ticker = ticker.trim().toUpperCase()
  if (!ticker || ticker === lastLookup) return
  lastLookup = ticker
  try {
    const q = await stockmateApi.quote(ticker)
    if (lastLookup !== ticker) return
    quote.value = q
    if (isEdit.value) return
    if (q.currency) form.currency = q.currency
    if (q.fx_rate) form.fx_rate = Math.round(q.fx_rate * 10000) / 10000
    if (!form.price_per_share && q.price != null) form.price_per_share = q.price
  } catch {
    quote.value = null
  }
}

async function lookupFx() {
  form.currency = form.currency.toUpperCase()
  if (form.currency === 'DKK') {
    form.fx_rate = 1
    return
  }
  try {
    const { rate_dkk } = await stockmateApi.fx(form.currency)
    form.fx_rate = Math.round(rate_dkk * 10000) / 10000
  } catch { /* behold den indtastede kurs */ }
}

async function save() {
  saving.value = true
  saveError.value = null
  const body: TxInput = {
    ...form,
    ticker: form.ticker.trim().toUpperCase(),
    currency: form.currency.toUpperCase(),
    note: form.note?.trim() || null,
    brokerage_fee: feeValue.value,
  }
  try {
    if (txId.value != null) await stockmateApi.updateTransaction(txId.value, body)
    else await stockmateApi.createTransaction(body)
    router.push(backTo.value)
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
