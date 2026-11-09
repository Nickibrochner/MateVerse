<template>
  <div class="space-y-6">
    <p v-if="loading && !pets.length" class="text-stone-500">Henter …</p>

    <div v-else-if="forbundet === false" class="panel space-y-3">
      <p>CatMate er ikke forbundet til Tractive endnu.</p>
      <router-link to="/catmate/indstillinger" class="btn-primary">Log ind på Tractive</router-link>
    </div>

    <template v-else>
      <p v-if="fejl" class="panel text-sm text-loss">{{ fejl }}</p>
      <p v-if="!fejl && !loading && !pets.length" class="panel text-stone-500">Der er ingen trackere på Tractive-kontoen.</p>

      <template v-if="pet">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-bold mr-auto">{{ pet.art === 'DOG' ? '🐕' : '🐈' }} {{ pet.navn }}</h1>
          <select v-if="pets.length > 1" v-model="valgtId" class="field !w-auto" aria-label="Vælg kæledyr">
            <option v-for="p in pets" :key="p.tracker_id" :value="p.tracker_id">{{ p.navn }}</option>
          </select>
          <div class="flex rounded-lg border border-stone-300 overflow-hidden bg-white" role="group" aria-label="Periode">
            <button
              v-for="p in PERIODER"
              :key="p.timer"
              type="button"
              class="px-3 py-2 text-sm font-semibold transition-colors"
              :class="timer === p.timer ? 'bg-accent text-white' : 'text-stone-600 hover:bg-stone-100'"
              :aria-pressed="timer === p.timer"
              @click="timer = p.timer"
            >{{ p.label }}</button>
          </div>
          <button type="button" class="btn-secondary" :disabled="loading" @click="load">{{ loading ? 'Henter …' : '↻ Opdatér' }}</button>
        </div>

        <dl class="panel grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div class="stat">
            <dt>Sidst set</dt>
            <dd>{{ pet.position ? sidenTekst(pet.position.time, nu) : '–' }}</dd>
            <p v-if="pet.position" class="text-xs text-stone-500">{{ tidspunkt(pet.position.time) }}</p>
          </div>
          <div class="stat">
            <dt>Batteri</dt>
            <dd :class="pet.batteri != null && pet.batteri <= 20 ? 'text-loss' : ''">{{ pet.batteri != null ? `${pet.batteri} %` : '–' }}</dd>
            <p class="text-xs text-stone-500">{{ pet.lader ? 'Lader' : pet.batteri != null && pet.batteri <= 20 ? 'Skal snart lades' : pet.model ?? '' }}</p>
          </div>
          <div class="stat">
            <dt>Tilbagelagt</dt>
            <dd>{{ rute ? afstand(rute.stat.afstand_m) : '–' }}</dd>
            <p class="text-xs text-stone-500">{{ periodeTekst }}</p>
          </div>
          <div class="stat">
            <dt>Længst fra start</dt>
            <dd>{{ rute ? afstand(rute.stat.max_fra_start_m) : '–' }}</dd>
            <p class="text-xs text-stone-500">{{ rute ? `${rute.stat.punkter} positioner` : '' }}</p>
          </div>
        </dl>

        <p v-if="rute?.fejl" class="panel text-sm bg-amber-50 border-amber-300">
          Ruten kunne ikke hentes fra Tractive ({{ rute.fejl }}). Kortet viser de positioner, CatMate tidligere har gemt.
        </p>

        <div class="h-[60vh] min-h-[24rem] rounded-xl overflow-hidden border border-stone-200 relative z-0">
          <LMap ref="mapRef" :zoom="7" @ready="zoom" :center="[56.2639, 9.5018]" :use-global-leaflet="false">
            <LTileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a>-bidragydere"
              layer-type="base"
              name="OpenStreetMap"
            />
            <LPolyline v-if="linje.length > 1" :lat-lngs="linje" :color="FARVE" :weight="3" :opacity="0.7" />
            <LCircleMarker
              v-for="p in rutePunkter"
              :key="p.time"
              :lat-lng="[p.lat, p.lng]"
              :radius="3"
              :color="FARVE"
              :weight="1"
              :fill-opacity="0.6"
            >
              <LPopup>{{ tidspunkt(p.time) }}<template v-if="p.speed != null"><br>{{ kmt(p.speed) }}</template></LPopup>
            </LCircleMarker>
            <template v-if="pet.position">
              <LCircle
                v-if="pet.position.uncertainty"
                :lat-lng="[pet.position.lat, pet.position.lng]"
                :radius="pet.position.uncertainty"
                :color="FARVE"
                :weight="1"
                :fill-opacity="0.12"
              />
              <LCircleMarker :lat-lng="[pet.position.lat, pet.position.lng]" :radius="9" color="#ffffff" :weight="3" :fill-color="FARVE" :fill-opacity="1">
                <LPopup>
                  <strong>{{ pet.navn }}</strong><br>
                  {{ tidspunkt(pet.position.time) }} ({{ sidenTekst(pet.position.time, nu) }})
                  <template v-if="pet.position.uncertainty"><br>Nøjagtighed ± {{ Math.round(pet.position.uncertainty) }} m</template>
                </LPopup>
              </LCircleMarker>
            </template>
          </LMap>
        </div>
        <p class="text-xs text-stone-400">
          Den store prik er seneste position, og ringen om den viser usikkerheden. Siden opdaterer selv hvert minut.
          Trackeren melder sjældnere ind, når katten ligger stille eller er i en strømsparezone.
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { LCircle, LCircleMarker, LMap, LPolyline, LPopup, LTileLayer } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { ApiError } from '../../../api'
import { afstand, catApi, sidenTekst, tidspunkt, type Pet, type Rute } from '../api'

/** Samme violette som matens accent. */
const FARVE = '#6d28d9'
const PERIODER = [
  { timer: 6, label: '6 t' },
  { timer: 24, label: '24 t' },
  { timer: 72, label: '3 d' },
  { timer: 168, label: '7 d' },
]
const VALG_KEY = 'mateverse:catmate-periode'

const pets = ref<Pet[]>([])
const valgtId = ref('')
const timer = ref(gemtPeriode())
const rute = ref<Rute | null>(null)
const forbundet = ref<boolean | null>(null)
const loading = ref(false)
const fejl = ref('')
const nu = ref(Date.now())

function gemtPeriode() {
  try {
    const n = Number(localStorage.getItem(VALG_KEY))
    return PERIODER.some(p => p.timer === n) ? n : 24
  } catch {
    return 24
  }
}

const pet = computed(() => pets.value.find(p => p.tracker_id === valgtId.value) ?? pets.value[0] ?? null)
const periodeTekst = computed(() => `seneste ${PERIODER.find(p => p.timer === timer.value)?.label.replace('t', 'timer').replace('d', 'dage')}`)
const kmt = (ms: number) => `${(ms * 3.6).toLocaleString('da-DK', { maximumFractionDigits: 1 })} km/t`

const linje = computed(() => (rute.value?.points ?? []).map(p => [p.lat, p.lng] as [number, number]))
/** Punkterne tegnes kun enkeltvis, når der er få nok til, at kortet stadig er let at trække rundt. */
const rutePunkter = computed(() => {
  const points = rute.value?.points ?? []
  return points.length <= 400 ? points : []
})

async function load() {
  loading.value = true
  fejl.value = ''
  try {
    pets.value = await catApi.pets()
    forbundet.value = true
    if (!pet.value || pet.value.tracker_id !== valgtId.value) valgtId.value = pet.value?.tracker_id ?? ''
    if (pet.value) rute.value = await catApi.route(pet.value.tracker_id, timer.value)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) forbundet.value = false
    else fejl.value = (e as Error).message
  } finally {
    loading.value = false
    nu.value = Date.now()
  }
}

watch(timer, t => {
  try {
    localStorage.setItem(VALG_KEY, String(t))
  } catch {
    // localStorage kan være blokeret – valget gælder så kun for denne visning.
  }
  load()
})
watch(valgtId, (_ny, gammel) => {
  if (gammel) load()
})

// Kortet zoomer til ruten, når kæledyr eller periode skifter – ikke ved de automatiske opdateringer,
// så man ikke bliver flyttet, mens man kigger på et udsnit.
const mapRef = ref<InstanceType<typeof LMap> | null>(null)
let zoometTil = ''
async function zoom() {
  const nøgle = `${pet.value?.tracker_id}:${timer.value}`
  const punkter = [...linje.value]
  if (pet.value?.position) punkter.push([pet.value.position.lat, pet.value.position.lng])
  if (!rute.value || !punkter.length || nøgle === zoometTil) return
  await nextTick()
  const map = mapRef.value?.leafletObject
  if (!map) return
  zoometTil = nøgle
  map.fitBounds(punkter, { padding: [40, 40], maxZoom: 17 })
}
// Data kan være hentet, før Leaflet er klar – derfor zoomes der også på kortets ready-hændelse.
watch([rute, pet], zoom)

let interval: ReturnType<typeof setInterval>
onMounted(() => {
  load()
  interval = setInterval(() => {
    if (!document.hidden && forbundet.value) load()
  }, 60_000)
})
onUnmounted(() => clearInterval(interval))
</script>
