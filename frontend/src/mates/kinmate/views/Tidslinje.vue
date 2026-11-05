<template>
  <KinPage title="Tidslinje">
    <template #actions>
      <input v-model="søgning" class="field !w-60" placeholder="Filtrér på navn …">
    </template>

    <p v-if="!grupper.length" class="text-stone-500">Ingen fødsels- eller dødsdatoer registreret endnu.</p>
    <ol v-else class="relative border-l-2 border-stone-200 ml-4 space-y-6">
      <li v-for="g in grupper" :key="g.årti" class="pl-6">
        <span class="absolute -left-[9px] w-4 h-4 rounded-full bg-accent border-2 border-white" />
        <h2 class="font-display font-bold text-lg text-stone-700">{{ g.årti }}'erne</h2>
        <ul class="mt-2 space-y-1">
          <li v-for="e in g.events" :key="e.id">
            <router-link :to="`/kinmate/personer/${e.personId}`" class="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white text-sm">
              <span>{{ e.type === 'født' ? '🎂' : '✝' }}</span>
              <span class="tabular-nums text-stone-500 w-10">{{ e.år }}</span>
              <span class="font-semibold">{{ e.navn }}</span>
              <span class="text-stone-400">{{ e.type }}</span>
            </router-link>
          </li>
        </ul>
      </li>
    </ol>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import KinPage from '../components/KinPage.vue'
import { useKinStore } from '../store'

const store = useKinStore()
const søgning = ref('')

interface Event { id: string; personId: string; navn: string; type: 'født' | 'død'; år: number }

const grupper = computed(() => {
  const q = søgning.value.trim().toLowerCase()
  const events: Event[] = []
  for (const p of store.persons) {
    if (q && !p.navn.toLowerCase().includes(q)) continue
    for (const [dato, type] of [[p.fødselsdato, 'født'], [p.dødsdato, 'død']] as const) {
      const år = dato ? parseInt(dato.slice(0, 4)) : NaN
      if (!isNaN(år)) events.push({ id: `${p.id}-${type}`, personId: p.id, navn: p.navn, type, år })
    }
  }
  const map = new Map<number, Event[]>()
  for (const e of events.sort((a, b) => a.år - b.år)) {
    const årti = Math.floor(e.år / 10) * 10
    ;(map.get(årti) ?? map.set(årti, []).get(årti)!).push(e)
  }
  return [...map].sort(([a], [b]) => a - b).map(([årti, events]) => ({ årti, events }))
})
</script>
