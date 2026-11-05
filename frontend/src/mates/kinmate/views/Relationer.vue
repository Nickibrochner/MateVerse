<template>
  <KinPage :title="`Relationer (${viste.length})`">
    <template #actions>
      <div class="w-56"><PersonPicker v-model="filterId" placeholder="Filtrér på person …" /></div>
      <button type="button" class="btn-primary" @click="åbnForm()">+ Ny relation</button>
    </template>

    <div class="flex flex-wrap items-center gap-4">
      <input v-model="søgning" class="field max-w-sm" placeholder="Søg på navn eller relationstype …">
      <label class="flex items-center gap-2 text-sm text-stone-600">
        <input v-model="skjulAuto" type="checkbox" class="w-4 h-4">
        Skjul automatiske modparter <span class="text-stone-400">({{ antalAuto }})</span>
      </label>
    </div>

    <div v-if="filterPerson" class="panel !py-2 flex items-center gap-3 bg-accent-soft border-accent/30 text-sm">
      Viser kun relationer for <strong>{{ filterPerson.navn }}</strong>
      <button type="button" class="text-accent hover:underline ml-auto" @click="filterId = ''">Ryd filter</button>
    </div>

    <section v-if="dubletter.length" class="panel bg-amber-50 border-amber-300">
      <h2 class="font-display font-bold text-amber-800">⚠️ Mulige dubletter ({{ dubletter.length }})</h2>
      <p class="text-sm text-amber-800 mb-3">Hver række viser to relationer i samme kategori. Slet den forkerte.</p>
      <ul class="space-y-2">
        <li v-for="d in dubletter" :key="`${d.id1}-${d.id2}`" class="bg-white rounded-lg border border-amber-200 p-3 text-sm">
          <div><strong>{{ d.person1_navn }}</strong> → <strong>{{ d.person2_navn }}</strong> <span class="tag bg-stone-100 text-stone-500 ml-1">{{ d.gruppe }}</span></div>
          <div class="flex flex-wrap gap-4 mt-2">
            <span v-for="[id, type] in [[d.id1, d.type1], [d.id2, d.type2]]" :key="id" class="flex items-center gap-2">
              <TypeBadge :type="type" />
              <button type="button" class="text-xs text-loss hover:underline" @click="slet(id)">Slet denne</button>
            </span>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="!viste.length" class="text-stone-500">{{ filterPerson ? `Ingen relationer for ${filterPerson.navn}.` : 'Ingen relationer oprettet endnu.' }}</p>
    <ul v-else class="panel !p-0 divide-y divide-stone-100">
      <li v-for="r in viste" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <div class="flex-1 min-w-[16rem]">
          <router-link :to="`/kinmate/personer/${r.person1_id}`" class="font-semibold hover:text-accent">{{ r.person1_navn }}</router-link>
          {{ erVar(r.person1_id) }} <TypeBadge :type="r.type_" /> {{ prep(r.type_) }}
          <router-link :to="`/kinmate/personer/${r.person2_id}`" class="font-semibold hover:text-accent">{{ r.person2_navn }}</router-link>
          <span v-if="r.noter === AUTO" class="tag bg-accent-soft text-accent ml-1">auto</span>
          <div class="text-xs text-stone-500 flex gap-3">
            <span v-if="r.start_dato">fra {{ r.start_dato }}</span>
            <span v-if="r.slut_dato">til {{ r.slut_dato }}</span>
            <span v-if="r.noter && r.noter !== AUTO" class="italic">{{ r.noter }}</span>
          </div>
        </div>
        <button type="button" class="btn-icon" aria-label="Rediger" @click="åbnForm(r)">✎</button>
        <ConfirmButton @confirm="slet(r.id)" />
      </li>
    </ul>

    <section>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 class="section-title !mb-0">💡 Automatiske forslag ({{ lokaleForslag.length }})</h2>
        <div class="flex gap-2">
          <button v-if="afviste.size" type="button" class="btn-secondary !py-1 !text-xs" @click="visAfviste">Vis {{ afviste.size }} afviste</button>
          <button type="button" class="btn-secondary !py-1 !text-xs" @click="loadAnalyse">↻ Genindlæs</button>
        </div>
      </div>
      <p v-if="!lokaleForslag.length" class="text-sm text-stone-500">Ingen nye forslag. Forslag udledes af de relationer, der allerede findes.</p>
      <ul v-else class="space-y-2">
        <li v-for="f in lokaleForslag" :key="nøgle(f)" class="panel !py-3 bg-amber-50/60 border-amber-200 flex flex-wrap items-center gap-3">
          <div class="flex-1 min-w-[16rem] text-sm">
            <strong>{{ f.person1_navn }}</strong> {{ erVar(f.person1_id) }}
            <TypeSelect :model-value="aktivType(f)" class="!py-1 text-sm mx-1" @update:model-value="v => (ændringer[nøgle(f)] = v)" />
            {{ prep(aktivType(f)) }} <strong>{{ f.person2_navn }}</strong>
            <div class="text-xs text-stone-500 italic">{{ f.begrundelse }}</div>
          </div>
          <button type="button" class="btn-primary !py-1 !text-xs" @click="accepter(f)">Opret</button>
          <button type="button" class="btn-secondary !py-1 !text-xs" @click="afvis(f)">Afvis</button>
        </li>
      </ul>
    </section>

    <Modal :open="formOpen" :title="redigererId ? 'Rediger relation' : 'Ny relation'" wide @close="formOpen = false">
      <form class="space-y-4" @submit.prevent="gem">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Person A</label>
            <PersonPicker v-model="form.person1_id" />
          </div>
          <div>
            <label class="label">Person B</label>
            <PersonPicker v-model="form.person2_id" />
          </div>
        </div>
        <div class="rounded-lg bg-stone-50 border border-stone-200 p-4 flex flex-wrap items-center gap-2">
          <strong>{{ fornavn(form.person1_id) ?? 'Person A' }}</strong> er
          <TypeSelect v-model="form.type_" />
          {{ prep(form.type_) }} <strong>{{ fornavn(form.person2_id) ?? 'Person B' }}</strong>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Startdato</label>
            <input v-model="form.start_dato" class="field" placeholder="ÅÅÅÅ-MM-DD">
          </div>
          <div>
            <label class="label">Slutdato</label>
            <input v-model="form.slut_dato" class="field" placeholder="ÅÅÅÅ-MM-DD">
          </div>
        </div>
        <div>
          <label class="label">Noter</label>
          <textarea v-model="form.noter" rows="2" class="field" placeholder="Evt. noter" />
        </div>
        <p v-if="!redigererId" class="text-xs text-stone-400">Modparten (fx søn ↔ far) oprettes automatisk, hvis Person B's køn er kendt.</p>
        <p v-if="fejl" class="text-loss text-sm">{{ fejl }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="formOpen = false">Annuller</button>
          <button type="submit" class="btn-primary">{{ redigererId ? 'Gem ændringer' : 'Opret relation' }}</button>
        </div>
      </form>
    </Modal>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import KinPage from '../components/KinPage.vue'
import PersonPicker from '../components/PersonPicker.vue'
import TypeSelect from '../components/TypeSelect.vue'
import TypeBadge from '../components/TypeBadge.vue'
import { kinApi, type Duplicate, type Relation, type RelationForslag, type RelationInput } from '../api'
import { useKinStore } from '../store'
import { prep } from '../relationTypes'

const AUTO = 'Auto-oprettet modpart'
const route = useRoute()
const store = useKinStore()

const erVar = (id: string) => (store.persons.find(p => p.id === id)?.dødsdato ? 'var' : 'er')
const fornavn = (id: string) => store.persons.find(p => p.id === id)?.navn.split(' ')[0]

// ── Filter og søgning ──
const filterId = ref((route.query.person as string | undefined) ?? '')
const filterPerson = computed(() => store.persons.find(p => p.id === filterId.value) ?? null)
const søgning = ref('')
const skjulAuto = ref(true)
const antalAuto = computed(() => store.relations.filter(r => r.noter === AUTO).length)

const viste = computed(() => {
  let list = store.relations
  if (skjulAuto.value) list = list.filter(r => r.noter !== AUTO)
  if (filterId.value) list = list.filter(r => r.person1_id === filterId.value || r.person2_id === filterId.value)
  const q = søgning.value.trim().toLowerCase()
  if (q) list = list.filter(r => [r.person1_navn, r.person2_navn, r.type_].some(s => s.toLowerCase().includes(q)))
  return list
})

// ── Dubletter og forslag ──
const dubletter = ref<Duplicate[]>([])
const forslag = ref<RelationForslag[]>([])
const ændringer = reactive<Record<string, string>>({})
const AFVIST_KEY = 'kinmate:afviste-forslag'
const afviste = ref<Set<string>>(new Set((() => { try { return JSON.parse(localStorage.getItem(AFVIST_KEY) ?? '[]') as string[] } catch { return [] } })()))
const gemAfviste = () => { try { localStorage.setItem(AFVIST_KEY, JSON.stringify([...afviste.value])) } catch { /* privat tilstand */ } }

const nøgle = (f: Pick<RelationForslag, 'person1_id' | 'person2_id' | 'type_'>) => `${f.person1_id}|${f.person2_id}|${f.type_}`
const aktivType = (f: RelationForslag) => ændringer[nøgle(f)] ?? f.type_
const lokaleForslag = computed(() => forslag.value
  .filter(f => !afviste.value.has(nøgle(f)))
  .filter(f => !filterId.value || f.person1_id === filterId.value || f.person2_id === filterId.value))

async function loadAnalyse() {
  try {
    ;[dubletter.value, forslag.value] = await Promise.all([kinApi.dubletter(), kinApi.forslag()])
  } catch { /* vises bare ikke */ }
}
onMounted(loadAnalyse)
watch(() => store.relations, loadAnalyse)

async function accepter(f: RelationForslag) {
  try {
    await kinApi.createRelation({ person1_id: f.person1_id, person2_id: f.person2_id, type_: aktivType(f), start_dato: null, slut_dato: null, noter: null })
    await store.loadAll()
  } catch (e) {
    alert((e as Error).message)
  }
}
function afvis(f: RelationForslag) {
  afviste.value.add(nøgle(f))
  afviste.value = new Set(afviste.value)
  gemAfviste()
}
function visAfviste() {
  afviste.value = new Set()
  gemAfviste()
}

async function slet(id: string) {
  await kinApi.deleteRelation(id)
  await store.loadAll()
}

// ── Formular ──
const formOpen = ref(false)
const redigererId = ref<string | null>(null)
const fejl = ref<string | null>(null)
const tomForm = (): RelationInput => ({ person1_id: filterId.value, person2_id: '', type_: 'far', start_dato: '', slut_dato: '', noter: '' })
const form = reactive<RelationInput>(tomForm())

function åbnForm(r?: Relation) {
  fejl.value = null
  redigererId.value = r?.id ?? null
  Object.assign(form, r
    ? { person1_id: r.person1_id, person2_id: r.person2_id, type_: r.type_, start_dato: r.start_dato ?? '', slut_dato: r.slut_dato ?? '', noter: r.noter ?? '' }
    : tomForm())
  formOpen.value = true
}

// Forælder-relationer starter typisk ved barnets fødsel
watch(() => [form.person2_id, form.type_], () => {
  if (!['far', 'mor'].includes(form.type_) || form.start_dato) return
  const b = store.persons.find(p => p.id === form.person2_id)
  if (b?.fødselsdato) form.start_dato = b.fødselsdato
})

async function gem() {
  if (!form.person1_id || !form.person2_id) {
    fejl.value = 'Vælg begge personer.'
    return
  }
  try {
    if (redigererId.value) await kinApi.updateRelation(redigererId.value, { ...form })
    else await kinApi.createRelation({ ...form })
    formOpen.value = false
    await store.loadAll()
  } catch (e) {
    fejl.value = (e as Error).message
  }
}
</script>
