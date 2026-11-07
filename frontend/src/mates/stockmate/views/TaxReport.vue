<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <router-link :to="`/stockmate/portfolio/${userId}`" class="text-sm text-stone-500 hover:text-accent">← Tilbage til porteføljen</router-link>
        <h1 class="text-3xl font-bold mt-2">{{ user?.username ?? '…' }}s skatteopgørelse</h1>
      </div>
      <button type="button" class="btn-secondary" :disabled="!rows.length" @click="exportCsv">⬇️ Eksportér CSV</button>
    </div>

    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!loaded" class="text-stone-400">Henter …</p>

    <template v-else>
      <p v-if="!rows.length" class="panel text-stone-500">Ingen realiserede gevinster/tab eller udbytter registreret endnu.</p>
      <div v-else class="panel !p-0 overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>År</th>
              <th>Depot</th>
              <th class="num">Realiseret gevinst/tab (DKK)</th>
              <th class="num">Udbytte modtaget (DKK)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="`${r.year}-${r.depot_type}`">
              <td class="font-semibold">{{ r.year }}</td>
              <td class="text-stone-500">{{ r.depot_type }}</td>
              <td class="num" :class="gainClass(r.realized_gain_loss)">{{ signed(r.realized_gain_loss) }}</td>
              <td class="num">{{ money(r.dividend_income) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { stockmateApi, type TaxYearSummary } from '../api'
import { useUsersStore } from '../../../stores/users'
import { gainClass, money, signed } from '../../../lib/format'
import { downloadCsv } from '../../../lib/csv'

const route = useRoute()
const usersStore = useUsersStore()
usersStore.load()

const userId = computed(() => Number(route.params.userId))
const user = computed(() => usersStore.byId(userId.value))
const rows = ref<TaxYearSummary[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

async function load() {
  loaded.value = false
  error.value = null
  try {
    rows.value = await stockmateApi.taxSummary(userId.value)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loaded.value = true
  }
}

function exportCsv() {
  const header = ['År', 'Depot', 'Realiseret gevinst/tab (DKK)', 'Udbytte modtaget (DKK)']
  const body = rows.value.map(r => [r.year, r.depot_type, r.realized_gain_loss, r.dividend_income])
  downloadCsv(`stockmate-aarsopgoerelse-${user.value?.username ?? userId.value}.csv`, [header, ...body])
}

watch(userId, load, { immediate: true })
</script>
