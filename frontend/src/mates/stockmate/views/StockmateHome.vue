<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-8">
    <section>
      <h1 class="text-3xl font-bold">Stockmate</h1>
      <p class="text-stone-500 mt-1">Vælg en portefølje. Kurser hentes fra Yahoo Finance og omregnes til DKK.</p>
    </section>

    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!rows" class="text-stone-400">Henter porteføljer …</p>

    <ul v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <li v-for="r in rows" :key="r.user.id">
        <router-link :to="`/stockmate/portfolio/${r.user.id}`" class="panel block hover:shadow-md hover:-translate-y-0.5 transition-all group">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold group-hover:text-accent">{{ r.user.username }}</h2>
            <span class="text-sm text-stone-400">{{ r.positions }} {{ r.positions === 1 ? 'position' : 'positioner' }}</span>
          </div>
          <dl class="grid grid-cols-2 gap-4 mt-4">
            <div class="stat">
              <dt>Værdi</dt>
              <dd>{{ money(r.value_dkk) }}</dd>
            </div>
            <div class="stat">
              <dt>Urealiseret</dt>
              <dd :class="gainClass(r.unrealized_dkk)">{{ signed(r.unrealized_dkk) }}</dd>
            </div>
          </dl>
          <p v-if="r.missing_prices" class="text-xs text-amber-700 mt-3">
            Mangler kurs på {{ r.missing_prices }} {{ r.missing_prices === 1 ? 'aktie' : 'aktier' }} – værdien er ufuldstændig.
          </p>
        </router-link>
      </li>
    </ul>

    <p class="text-sm text-stone-500">
      Mangler der en person? Brugere oprettes i <router-link to="/" class="text-accent font-semibold hover:underline">hubben</router-link>.
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { stockmateApi, type OverviewRow } from '../api'
import { gainClass, money, signed } from '../../../lib/format'

const rows = ref<OverviewRow[] | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    rows.value = await stockmateApi.overview()
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>
