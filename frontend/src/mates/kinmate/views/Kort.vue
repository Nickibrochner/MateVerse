<template>
  <KinPage title="Geografisk kort">
    <template #actions>
      <span class="text-sm text-stone-500 self-center">{{ geokodetAntal }} / {{ stedNavne.size }} sogne geokodet</span>
      <button type="button" class="btn-primary" :disabled="geokoder || !manglende.length" @click="geokodAlle">
        {{ geokoder ? `Geokoder … (${geokodetNu}/${antalAtGeokode})` : `🔍 Geokod ${manglende.length} manglende sogne` }}
      </button>
    </template>

    <p class="text-sm text-stone-500">
      Sognene, der er registreret som fødsels- eller dødssted, vises på et kort fra OpenStreetMap. Stednavne slås op via Nominatim og gemmes, så hvert sogn kun slås op én gang.
    </p>

    <div v-if="fejl.length" class="panel bg-amber-50 border-amber-300 text-sm">
      <strong>{{ fejl.length }} sogn(e) kunne ikke geokodes automatisk:</strong>
      <ul class="list-disc pl-5 my-2">
        <li v-for="(f, i) in fejl" :key="i">{{ f.navn }} – {{ f.fejl }}</li>
      </ul>
      Indtast koordinaterne manuelt nedenfor i stedet.
    </div>

    <details v-if="manglende.length" class="panel !py-3">
      <summary class="cursor-pointer text-sm font-semibold">Indtast koordinater manuelt</summary>
      <form class="flex flex-wrap gap-2 items-end mt-3" @submit.prevent="gemManuel">
        <select v-model="manuel.sted" class="field !w-auto">
          <option value="">Vælg sogn</option>
          <option v-for="n in manglende" :key="n" :value="n">{{ n }}</option>
        </select>
        <a
          :href="manuel.sted ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${manuel.sted} kirke, Danmark`)}` : undefined"
          target="_blank"
          rel="noopener"
          class="btn-secondary"
          :class="!manuel.sted && 'opacity-50 pointer-events-none'"
        >🔍 Find kirken på OpenStreetMap</a>
        <input v-model="manuel.lat" class="field !w-40" placeholder="Breddegrad, fx 55.6761">
        <input v-model="manuel.lng" class="field !w-40" placeholder="Længdegrad, fx 12.5683">
        <button type="submit" class="btn-primary" :disabled="!kanGemme">Gem</button>
      </form>
      <p class="text-xs text-stone-400 mt-2">Brug helst sognekirkens koordinater. De er entydige, og kirken er kilden til kirkebøgerne.</p>
    </details>

    <div class="h-[60vh] min-h-[24rem] rounded-xl overflow-hidden border border-stone-200 relative z-0">
      <LMap ref="mapRef" :zoom="7" :center="[56.2639, 9.5018]" :use-global-leaflet="false">
        <LTileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a>-bidragydere"
          layer-type="base"
          name="OpenStreetMap"
        />
        <LCircleMarker v-for="m in markører" :key="m.navn" :lat-lng="[m.lat, m.lng]" :radius="m.radius" color="#0f766e" :fill-opacity="0.55">
          <LPopup>
            <strong>{{ m.navn }}</strong><br>
            {{ m.personer.length }} {{ m.personer.length === 1 ? 'person' : 'personer' }}:
            <ul class="mt-1">
              <li v-for="p in m.personer" :key="p.navn">
                <span v-if="p.født" title="Født her">🎂</span><span v-if="p.død" title="Død her">✝</span> {{ p.navn }}
              </li>
            </ul>
          </LPopup>
        </LCircleMarker>
      </LMap>
    </div>
    <p v-if="!markører.length" class="text-sm text-stone-500">Ingen sogne er geokodet endnu.</p>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { LCircleMarker, LMap, LPopup, LTileLayer } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import KinPage from '../components/KinPage.vue'
import { kinApi } from '../api'
import { useKinStore } from '../store'

const store = useKinStore()

interface Tilknytning { navn: string; født: boolean; død: boolean }

/** Stednavn → personer, der er født og/eller døde der. */
const stedNavne = computed(() => {
  const map = new Map<string, Tilknytning[]>()
  for (const p of store.persons) {
    for (const [navn, født] of [[p.fødselsogn?.trim(), true], [p.dødssogn?.trim(), false]] as const) {
      if (!navn) continue
      const liste = map.get(navn) ?? map.set(navn, []).get(navn)!
      let e = liste.find(x => x.navn === p.navn)
      if (!e) liste.push(e = { navn: p.navn, født: false, død: false })
      if (født) e.født = true
      else e.død = true
    }
  }
  return map
})

const geokodede = computed(() => new Set(store.steder.filter(s => s.lat != null).map(s => s.navn)))
const manglende = computed(() => [...stedNavne.value.keys()].filter(n => !geokodede.value.has(n)))
const geokodetAntal = computed(() => [...stedNavne.value.keys()].filter(n => geokodede.value.has(n)).length)

// ── Automatisk geokodning – ét opslag ad gangen af hensyn til Nominatims vilkår ──
const geokoder = ref(false)
const geokodetNu = ref(0)
const antalAtGeokode = ref(0)
const fejl = ref<{ navn: string; fejl: string }[]>([])
async function geokodAlle() {
  geokoder.value = true
  geokodetNu.value = 0
  fejl.value = []
  const liste = [...manglende.value]
  antalAtGeokode.value = liste.length
  for (const navn of liste) {
    try {
      await kinApi.geocode(navn)
    } catch (e) {
      fejl.value.push({ navn, fejl: (e as Error).message })
    }
    geokodetNu.value++
    await new Promise(r => setTimeout(r, 1100))
  }
  geokoder.value = false
  await store.loadAll()
}

// ── Manuel indtastning ──
const manuel = reactive({ sted: '', lat: '', lng: '' })
const tal = (s: string) => parseFloat(s.replace(',', '.'))
const kanGemme = computed(() => {
  const lat = tal(manuel.lat), lng = tal(manuel.lng)
  return !!manuel.sted && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
})
async function gemManuel() {
  await kinApi.setStedKoordinater(manuel.sted, tal(manuel.lat), tal(manuel.lng))
  Object.assign(manuel, { sted: '', lat: '', lng: '' })
  await store.loadAll()
}

// ── Markører ──
const markører = computed(() => {
  const steder = store.steder.filter(s => s.lat != null && s.lng != null && stedNavne.value.has(s.navn))
  const max = Math.max(1, ...steder.map(s => stedNavne.value.get(s.navn)!.length))
  return steder.map(s => {
    const personer = stedNavne.value.get(s.navn)!
    return { navn: s.navn, lat: s.lat!, lng: s.lng!, radius: 6 + (personer.length / max) * 16, personer }
  })
})

// Kortet zoomer til markørerne, når de ændrer sig
const mapRef = ref<InstanceType<typeof LMap> | null>(null)
watch(markører, async nye => {
  if (!nye.length) return
  await nextTick()
  const map = mapRef.value?.leafletObject
  if (!map) return
  if (nye.length === 1) map.setView([nye[0].lat, nye[0].lng], 10)
  else map.fitBounds(nye.map(m => [m.lat, m.lng] as [number, number]), { padding: [40, 40] })
}, { immediate: true })
</script>
