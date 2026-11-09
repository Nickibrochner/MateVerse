<template>
  <div class="space-y-6">
    <p v-if="loading && !data" class="text-stone-500">Henter …</p>

    <div v-else-if="forbundet === false" class="panel space-y-3">
      <p>CatMate er ikke forbundet til Tractive endnu.</p>
      <router-link to="/catmate/indstillinger" class="btn-primary">Log ind på Tractive</router-link>
    </div>

    <p v-else-if="fejl" class="panel text-sm text-loss">{{ fejl }}</p>

    <template v-else-if="data">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold mr-auto">📊 {{ data.navn }}</h1>
        <select v-if="pets.length > 1" v-model="valgtId" class="field !w-auto" aria-label="Vælg kæledyr">
          <option v-for="p in pets" :key="p.tracker_id" :value="p.tracker_id">{{ p.navn }}</option>
        </select>
        <button type="button" class="btn-secondary" :disabled="loading" @click="load">{{ loading ? 'Henter …' : '↻ Opdatér' }}</button>
      </div>

      <p v-if="data.rute_fejl" class="panel text-sm bg-amber-50 border-amber-300">
        Ruten kunne ikke hentes fra Tractive ({{ data.rute_fejl }}). Tallene bygger på de positioner, CatMate tidligere har gemt.
      </p>

      <!-- ── I dag ── -->
      <section>
        <h2 class="section-title">I dag</h2>
        <dl class="panel grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div class="stat">
            <dt>Tilbagelagt</dt>
            <dd>{{ afstand(data.i_dag.afstand_m) }}</dd>
            <p class="text-xs text-stone-500">siden midnat</p>
          </div>
          <div class="stat">
            <dt>Aktiv / hvile</dt>
            <dd>{{ dagens?.aktiv_min != null ? varighed(dagens.aktiv_min) : '–' }}</dd>
            <p class="text-xs text-stone-500">{{ dagens?.hvile_min != null ? `${varighed(dagens.hvile_min)} hvile` : 'fra Tractive' }}</p>
          </div>
          <div class="stat">
            <dt>Spurter</dt>
            <dd>{{ data.i_dag.spurter.length }}</dd>
            <p class="text-xs text-stone-500">{{ dagensTop ? `top ${kmt(dagensTop)}` : 'ingen over 11 km/t' }}</p>
          </div>
          <div class="stat">
            <dt>Hjemme</dt>
            <dd>{{ data.i_dag.hjemme?.hjemme_pct != null ? `${data.i_dag.hjemme.hjemme_pct} %` : '–' }}</dd>
            <p class="text-xs text-stone-500">
              <template v-if="data.i_dag.hjemme">{{ varighed(data.i_dag.hjemme.ude_min) }} ude</template>
              <router-link v-else to="/catmate/indstillinger" class="text-accent underline">Sæt et hjemmepunkt</router-link>
            </p>
          </div>
        </dl>
      </section>

      <!-- ── Aktivitet og søvn (Tractives egne tal) ── -->
      <section>
        <h2 class="section-title">Aktivitet og søvn</h2>
        <p v-if="!dagens" class="panel text-sm text-stone-600">
          Tractive leverede ingen aktivitets- og søvntal<template v-if="data.sundhed.fejl"> ({{ data.sundhed.fejl }})</template>.
          De kommer fra Tractives egen aktivitetsmåling og kan ikke regnes ud af GPS-positionerne.
        </p>
        <div v-else class="grid md:grid-cols-2 gap-4">
          <div class="panel space-y-4">
            <div>
              <div class="flex justify-between text-sm">
                <span class="font-semibold">Dagens aktivitetsmål</span>
                <span class="tabular-nums text-stone-600">{{ dagens.aktiv_min ?? 0 }} / {{ dagens.maal_min ?? '–' }} min</span>
              </div>
              <div class="h-3 rounded-full bg-stone-100 mt-2 overflow-hidden" role="progressbar" :aria-valuenow="målPct" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-accent" :style="{ width: `${målPct}%` }" />
              </div>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="font-display text-3xl font-bold tabular-nums">{{ data.sundhed.streak }}</span>
              <span class="text-sm text-stone-600">{{ data.sundhed.streak === 1 ? 'dag' : 'dage' }} i træk med målet nået</span>
            </div>
            <div class="flex gap-1" aria-label="Seneste dage">
              <span
                v-for="d in data.sundhed.dage"
                :key="d.dato"
                class="flex-1 h-6 rounded grid place-items-center text-[10px] font-semibold"
                :class="d.maal_naaet ? 'bg-accent text-white' : 'bg-stone-100 text-stone-400'"
                :title="`${date(d.dato)}: ${d.aktiv_min ?? '–'} af ${d.maal_min ?? '–'} min`"
              >{{ d.dato.slice(8) }}</span>
            </div>
            <p class="text-xs text-stone-400">
              Tractive giver kun dagens tal, så rækken tæller fra den dag, CatMate begyndte at gemme dem.
            </p>
          </div>

          <div class="panel space-y-4">
            <BarList :rows="søvnRækker" :format="varighed" />
            <p v-if="dagens.kalorier != null" class="text-sm text-stone-600">Forbrændt i dag: {{ dagens.kalorier }} kcal</p>
            <p class="text-xs text-stone-400">
              Nattesøvn er kl. 22–06, dagsøvn resten af døgnet. Antal opvågninger og forstyrrelser om natten leverer Tractive ikke
              i de tal, CatMate kan hente, så søvnkvalitet vises ikke.
            </p>
          </div>
        </div>
      </section>

      <!-- ── Seneste 7 døgn ── -->
      <section>
        <h2 class="section-title">Seneste 7 døgn</h2>
        <p v-if="data.uge.fra && dækning < 6" class="text-sm text-stone-500 mb-3">
          CatMate har kun positioner fra de seneste {{ dækningTekst }}, så tallene dækker ikke en hel uge endnu.
        </p>
        <div class="grid lg:grid-cols-3 gap-4">
          <div class="panel lg:col-span-2 space-y-3">
            <dl class="grid grid-cols-3 gap-5">
              <div class="stat">
                <dt>Territorium</dt>
                <dd>{{ data.uge.territorium.areal_m2 ? areal(data.uge.territorium.areal_m2) : '–' }}</dd>
              </div>
              <div class="stat">
                <dt>Tilbagelagt</dt>
                <dd>{{ afstand(data.uge.afstand_m) }}</dd>
              </div>
              <div class="stat">
                <dt>Hjemme</dt>
                <dd>{{ data.uge.hjemme?.hjemme_pct != null ? `${data.uge.hjemme.hjemme_pct} %` : '–' }}</dd>
              </div>
            </dl>
            <div class="h-80 rounded-lg overflow-hidden border border-stone-200 relative z-0">
              <LMap ref="mapRef" :zoom="7" :center="[56.2639, 9.5018]" :use-global-leaflet="false" @ready="zoom">
                <LTileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a>-bidragydere"
                  layer-type="base"
                  name="OpenStreetMap"
                />
                <LPolygon v-if="omrids.length" :lat-lngs="omrids" :color="FARVE" :weight="2" :fill-opacity="0.08" />
                <LCircle v-if="data.hjem" :lat-lng="[data.hjem.lat, data.hjem.lng]" :radius="data.hjem.radius" color="#047857" :weight="2" :fill-opacity="0.15">
                  <LPopup><strong>Hjem</strong><br>Radius {{ data.hjem.radius }} m</LPopup>
                </LCircle>
                <LCircleMarker
                  v-for="(h, i) in data.uge.hotspots"
                  :key="i"
                  :lat-lng="[h.lat, h.lng]"
                  :radius="8 + (h.minutter / maxHotspot) * 10"
                  color="#ffffff"
                  :weight="2"
                  :fill-color="FARVE"
                  :fill-opacity="0.85"
                >
                  <LTooltip :options="{ permanent: true, direction: 'center', className: 'catmate-nr' }">{{ i + 1 }}</LTooltip>
                  <LPopup><strong>Favoritsted {{ i + 1 }}</strong><br>{{ varighed(h.minutter) }} · {{ h.besøg }} besøg</LPopup>
                </LCircleMarker>
              </LMap>
            </div>
            <p class="text-xs text-stone-400">
              Det violette område er det mindste område, der rummer alle ugens positioner. Den grønne ring er hjemmet, og de
              nummererede prikker er favoritstederne.
            </p>
          </div>

          <div class="panel space-y-3">
            <h3 class="font-semibold">Favoritsteder uden for hjemmet</h3>
            <p v-if="!data.uge.hotspots.length" class="text-sm text-stone-500">
              Ingen steder med mindst 10 minutters ophold endnu.
            </p>
            <ol v-else class="space-y-2">
              <li v-for="(h, i) in data.uge.hotspots" :key="i" class="flex items-start gap-3 text-sm">
                <span class="grid place-items-center w-6 h-6 rounded-full bg-accent text-white text-xs font-bold shrink-0">{{ i + 1 }}</span>
                <span>
                  <strong class="tabular-nums">{{ varighed(h.minutter) }}</strong> · {{ h.besøg }} besøg
                  <span v-if="h.afstand_hjem_m != null" class="block text-xs text-stone-500">{{ afstand(h.afstand_hjem_m) }} hjemmefra</span>
                </span>
              </li>
            </ol>
            <p v-if="!data.hjem" class="text-xs text-stone-500">
              Uden et hjemmepunkt står hjemmet nok øverst.
              <router-link to="/catmate/indstillinger" class="text-accent underline">Sæt et hjemmepunkt</router-link>
            </p>
          </div>
        </div>
      </section>

      <div class="grid md:grid-cols-2 gap-4">
        <!-- ── Natteravn ── -->
        <section class="panel space-y-3">
          <h2 class="section-title !mb-0">Natteravn-faktor</h2>
          <div class="flex items-baseline gap-3">
            <span class="font-display text-3xl font-bold tabular-nums">{{ data.uge.natteravn.score ?? '–' }}</span>
            <span class="text-sm text-stone-600">{{ data.uge.natteravn.score != null ? 'af 100 · ' : '' }}{{ data.uge.natteravn.label }}</span>
          </div>
          <div class="flex items-end gap-px h-24" role="img" :aria-label="`Bevægelse fordelt på døgnets timer. ${data.uge.natteravn.label}`">
            <div
              v-for="(m, t) in data.uge.meter_pr_time"
              :key="t"
              class="flex-1 rounded-t"
              :class="t >= 22 || t < 6 ? 'bg-accent' : 'bg-stone-300'"
              :style="{ height: `${maxTime ? Math.max((m / maxTime) * 100, m ? 3 : 0) : 0}%` }"
              :title="`Kl. ${t}–${t + 1}: ${afstand(m)}`"
            />
          </div>
          <div class="flex justify-between text-[10px] text-stone-400 tabular-nums"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
          <p class="text-xs text-stone-400">
            Andelen af ugens bevægelse, der ligger kl. 22–06 (violette søjler). En kat, der er lige aktiv hele døgnet, får 33.
          </p>
        </section>

        <div class="space-y-4">
          <!-- ── Batteri ── -->
          <section class="panel space-y-2">
            <h2 class="section-title !mb-0">Batteri</h2>
            <div class="flex items-baseline gap-3">
              <span class="font-display text-3xl font-bold tabular-nums">{{ data.batteri.niveau != null ? `${data.batteri.niveau} %` : '–' }}</span>
              <span class="text-sm text-stone-600">
                <template v-if="data.batteri.lader">Lader</template>
                <template v-else-if="data.batteri.prognose">tomt {{ tomTekst }}</template>
              </span>
            </div>
            <p v-if="data.batteri.prognose" class="text-sm text-stone-600">
              Bruger ca. {{ data.batteri.prognose.pct_pr_døgn.toLocaleString('da-DK') }} procentpoint i døgnet – ventes tomt
              {{ tidspunkt(data.batteri.prognose.tom_time) }}.
            </p>
            <p v-else-if="!data.batteri.lader" class="text-sm text-stone-500">
              Prognosen kommer, når CatMate har målt batteriet falde mindst 2 procentpoint over to timer siden seneste opladning.
            </p>
          </section>

          <!-- ── Spurter ── -->
          <section class="panel space-y-2">
            <h2 class="section-title !mb-0">Spurter denne uge</h2>
            <p v-if="!data.uge.spurter.length" class="text-sm text-stone-500">Ingen målinger over 11 km/t.</p>
            <ul v-else class="text-sm divide-y divide-stone-100">
              <li v-for="s in senesteSpurter" :key="s.time" class="flex justify-between py-1.5">
                <span>{{ tidspunkt(s.time) }}</span>
                <span class="tabular-nums font-semibold">{{ kmt(s.top_kmt) }}</span>
              </li>
            </ul>
            <p class="text-xs text-stone-400">
              Trackeren måler med minutters mellemrum, så korte spurter mellem to målinger bliver ikke opdaget. Flest fanges under live-tracking.
            </p>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { LCircle, LCircleMarker, LMap, LPolygon, LPopup, LTileLayer, LTooltip } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { ApiError } from '../../../api'
import BarList from '../../../components/BarList.vue'
import { date } from '../../../lib/format'
import { afstand, areal, catApi, tidspunkt, varighed, type Indsigt, type Pet } from '../api'

const FARVE = '#6d28d9'

const pets = ref<Pet[]>([])
const valgtId = ref('')
const data = ref<Indsigt | null>(null)
const forbundet = ref<boolean | null>(null)
const loading = ref(false)
const fejl = ref('')

const kmt = (v: number) => `${v.toLocaleString('da-DK', { maximumFractionDigits: 1 })} km/t`

const dagens = computed(() => data.value?.sundhed.i_dag ?? null)
const målPct = computed(() => {
  const d = dagens.value
  return d?.aktiv_min != null && d.maal_min ? Math.min(100, Math.round((d.aktiv_min / d.maal_min) * 100)) : 0
})
const søvnRækker = computed(() => {
  const d = dagens.value
  return [
    { label: '🌙 Nattesøvn', value: d?.natsoevn_min ?? 0 },
    { label: '☀️ Dagsøvn', value: d?.dagsoevn_min ?? 0 },
    { label: '🛋️ Hvile', value: d?.hvile_min ?? 0 },
    { label: '🐾 Aktiv', value: d?.aktiv_min ?? 0 },
  ]
})
const dagensTop = computed(() => Math.max(0, ...(data.value?.i_dag.spurter.map(s => s.top_kmt) ?? [])))
const senesteSpurter = computed(() => [...(data.value?.uge.spurter ?? [])].reverse().slice(0, 6))
const maxTime = computed(() => Math.max(0, ...(data.value?.uge.meter_pr_time ?? [])))
const maxHotspot = computed(() => Math.max(1, ...(data.value?.uge.hotspots.map(h => h.minutter) ?? [])))
const omrids = computed(() => (data.value?.uge.territorium.omrids ?? []).map(p => [p.lat, p.lng] as [number, number]))

/** Hvor mange døgn tilbage de gemte positioner rækker. */
const dækning = computed(() => (data.value?.uge.fra ? (Date.now() / 1000 - data.value.uge.fra) / 86_400 : 0))
const dækningTekst = computed(() => {
  const timer = Math.round(dækning.value * 24)
  return timer < 48 ? `${timer} timer` : `${Math.round(dækning.value)} døgn`
})
const tomTekst = computed(() => {
  const p = data.value?.batteri.prognose
  if (!p) return ''
  return p.timer_tilbage < 48 ? `om ca. ${p.timer_tilbage} timer` : `om ca. ${Math.round(p.timer_tilbage / 24)} dage`
})

async function load() {
  loading.value = true
  fejl.value = ''
  try {
    pets.value = await catApi.pets()
    forbundet.value = true
    const pet = pets.value.find(p => p.tracker_id === valgtId.value) ?? pets.value[0]
    if (!pet) {
      fejl.value = 'Der er ingen trackere på Tractive-kontoen.'
      return
    }
    if (pet.tracker_id !== valgtId.value) valgtId.value = pet.tracker_id
    data.value = await catApi.indsigt(pet.tracker_id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) forbundet.value = false
    else fejl.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(valgtId, (_ny, gammel) => {
  if (gammel) load()
})

// Kortet zoomer til territorium, hjem og favoritsteder – også hvis data ankom, før Leaflet var klar.
const mapRef = ref<InstanceType<typeof LMap> | null>(null)
async function zoom() {
  const d = data.value
  if (!d) return
  const punkter: [number, number][] = [...omrids.value, ...d.uge.hotspots.map(h => [h.lat, h.lng] as [number, number])]
  if (d.hjem) punkter.push([d.hjem.lat, d.hjem.lng])
  if (!punkter.length) return
  await nextTick()
  mapRef.value?.leafletObject?.fitBounds(punkter, { padding: [30, 30], maxZoom: 18 })
}
watch(data, zoom)

onMounted(load)
</script>

<style>
/* Tallet i favoritstedernes prikker: Leaflets tooltip uden boks og pil. */
.catmate-nr {
  background: none;
  border: none;
  box-shadow: none;
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  padding: 0;
}
.catmate-nr::before {
  display: none;
}
</style>
