<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Leaderboard</h1>

    <p v-if="loading" class="text-stone-500">Henter …</p>
    <template v-else-if="rows.length">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div v-for="(r, i) in podie" :key="r.player_id" class="panel text-center" :class="i === 0 && 'border-accent'">
          <div class="text-2xl">{{ ['🥇', '🥈', '🥉'][i] }}</div>
          <div class="font-semibold mt-1">{{ r.navn }}</div>
          <div class="text-xs text-stone-500">{{ r.sejre }} sejre</div>
        </div>
      </div>

      <div class="panel !p-0 overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Spiller</th><th class="num">Spil</th><th class="num">Sejre</th><th class="num">Sejr%</th>
              <th class="num">Point i alt</th><th class="num">Bedste spil</th><th class="num">Kontrakt-succes</th><th>Badges</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in sorteret" :key="r.player_id">
              <td class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: r.farve }"></span>{{ r.navn }}
                <span v-if="!r.aktiv" class="text-xs text-stone-400">(skjult)</span>
              </td>
              <td class="num">{{ r.spil_spillet }}</td>
              <td class="num">{{ r.sejre }}</td>
              <td class="num">{{ r.spil_spillet ? Math.round((r.sejre / r.spil_spillet) * 100) : 0 }}%</td>
              <td class="num font-semibold" :class="gainClass(r.total_point)">{{ r.total_point }}</td>
              <td class="num">{{ r.bedste_spil ?? '–' }}</td>
              <td class="num">{{ r.kontrakt_forsoegt ? `${r.kontrakt_vundet}/${r.kontrakt_forsoegt}` : '–' }}</td>
              <td class="text-xs">
                <span v-if="r.grand_slams" title="Grand slam (10/10 stik som melder)">👑{{ r.grand_slams > 1 ? ` ×${r.grand_slams}` : '' }}</span>
                <span v-if="r.nullo_sejre" title="Nullo-sejre" class="ml-1">🃏{{ r.nullo_sejre > 1 ? ` ×${r.nullo_sejre}` : '' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <p v-else class="panel text-stone-500">Ingen spil endnu.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { mate500Api, type LeaderboardRow } from '../api'
import { gainClass } from '../../../lib/format'

const rows = ref<LeaderboardRow[]>([])
const loading = ref(false)

const sorteret = computed(() => [...rows.value].sort((a, b) => b.sejre - a.sejre || b.total_point - a.total_point))
const podie = computed(() => sorteret.value.filter(r => r.spil_spillet > 0).slice(0, 3))

onMounted(async () => {
  loading.value = true
  try {
    rows.value = await mate500Api.leaderboard()
  } finally {
    loading.value = false
  }
})
</script>
