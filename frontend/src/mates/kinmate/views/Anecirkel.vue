<template>
  <KinPage title="Anecirkel">
    <template #actions>
      <div class="w-64"><PersonPicker v-model="centerId" placeholder="Vælg udgangsperson …" /></div>
      <div class="flex items-center gap-1 text-sm">
        <button type="button" class="btn-icon" aria-label="Færre generationer" @click="dybde = Math.max(2, dybde - 1)">−</button>
        <span class="tabular-nums w-28 text-center">{{ dybde }} generationer</span>
        <button type="button" class="btn-icon" aria-label="Flere generationer" @click="dybde = Math.min(7, dybde + 1)">+</button>
      </div>
    </template>

    <p v-if="!centerId" class="text-stone-500">Vælg en person for at se anecirklen.</p>
    <div v-else class="panel">
      <svg :viewBox="`${-ydre - 10} ${-ydre - 10} ${2 * (ydre + 10)} ${2 * (ydre + 10)}`" class="w-full max-h-[75vh] mx-auto block">
        <g v-for="w in wedges" :key="w.ahnentafel">
          <path :d="w.path" :fill="w.fill" :stroke="w.stroke" stroke-width="1.5" :class="w.person && 'cursor-pointer hover:opacity-80'" @click="w.person && (centerId = w.person.id)">
            <title v-if="w.person">{{ w.person.navn }}{{ w.person.fødselsdato ? ` (f. ${w.person.fødselsdato.slice(0, 4)})` : '' }}</title>
          </path>
          <text v-if="w.person" :transform="`translate(${w.lx}, ${w.ly}) rotate(${w.rot})`" text-anchor="middle" dominant-baseline="middle" class="fill-stone-800 pointer-events-none" style="font-size: 10px">
            {{ kort(w.person.navn) }}
          </text>
        </g>
        <circle :r="CENTER" class="fill-accent-soft stroke-accent" stroke-width="2" />
        <text text-anchor="middle" dy="-2" class="fill-stone-900 font-semibold" style="font-size: 11px">{{ kort(center?.navn ?? '') }}</text>
        <text text-anchor="middle" dy="13" class="fill-stone-500" style="font-size: 10px">{{ center?.fødselsdato?.slice(0, 4) ?? '' }}</text>
      </svg>
      <p class="text-sm text-stone-500 text-center mt-2">Klik på en forfader for at gøre vedkommende til ny udgangsperson.</p>
    </div>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import KinPage from '../components/KinPage.vue'
import PersonPicker from '../components/PersonPicker.vue'
import { useKinStore } from '../store'
import { findForældreIdsAf } from '../slaegtsgraf'
import type { Person } from '../api'

const CENTER = 46
const RING = 62
const FARVER = ['#6366f1', '#0891b2', '#059669', '#f59e0b', '#f97316', '#db2777', '#8b5cf6']

const store = useKinStore()
const centerId = ref('')
const dybde = ref(5)
const person = (id: string) => store.persons.find(p => p.id === id)
const center = computed(() => person(centerId.value))
const ydre = computed(() => CENTER + dybde.value * RING)
const kort = (navn: string) => (navn.length > 16 ? `${navn.slice(0, 15)}…` : navn)

const polar = (r: number, grader: number): [number, number] => {
  const rad = ((grader - 90) * Math.PI) / 180
  return [r * Math.cos(rad), r * Math.sin(rad)]
}
function wedgePath(ri: number, ry: number, start: number, slut: number) {
  const [x1, y1] = polar(ri, start), [x2, y2] = polar(ry, start), [x3, y3] = polar(ry, slut), [x4, y4] = polar(ri, slut)
  const large = slut - start > 180 ? 1 : 0
  return `M ${x1} ${y1} L ${x2} ${y2} A ${ry} ${ry} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${ri} ${ri} 0 ${large} 0 ${x1} ${y1} Z`
}

/**
 * Ahnentafel: 1 = personen selv, 2n = n's far, 2n+1 = n's mor.
 * Hver generation er en ring; hver plads er en lige stor del af cirklen.
 */
const wedges = computed(() => {
  if (!centerId.value) return []
  const ud: { ahnentafel: number; person: Person | null; path: string; fill: string; stroke: string; lx: number; ly: number; rot: number }[] = []
  let frontier = [{ ahn: 1, id: centerId.value }]
  for (let gen = 1; gen <= dybde.value && frontier.length; gen++) {
    const ri = CENTER + (gen - 1) * RING, ry = CENTER + gen * RING
    const slots = 2 ** gen
    const farve = FARVER[(gen - 1) % FARVER.length]
    const næste: typeof frontier = []
    for (const { ahn, id } of frontier) {
      const forældre = findForældreIdsAf(store.relations, id).map(person).filter((p): p is Person => !!p)
      const far = forældre.find(p => p.køn === 'mand') ?? forældre[0]
      const mor = forældre.find(p => p.id !== far?.id)
      for (const [a, p] of [[2 * ahn, far], [2 * ahn + 1, mor]] as const) {
        const i = a - slots
        const start = (i / slots) * 360, slut = ((i + 1) / slots) * 360, midt = (start + slut) / 2
        const [lx, ly] = polar((ri + ry) / 2, midt)
        let rot = midt - 90
        if (midt > 90 && midt < 270) rot += 180
        ud.push({ ahnentafel: a, person: p ?? null, path: wedgePath(ri, ry, start, slut), fill: p ? `${farve}22` : '#f5f5f4', stroke: p ? farve : '#e7e5e4', lx, ly, rot })
        if (p) næste.push({ ahn: a, id: p.id })
      }
    }
    frontier = næste
  }
  return ud
})
</script>
