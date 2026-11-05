<template>
  <KinPage :title="person?.navn ?? 'Person'">
    <template #actions>
      <template v-if="person">
        <button type="button" class="btn-secondary" @click="editOpen = true">✎ Rediger</button>
        <button type="button" class="btn-secondary" @click="eksporterMarkdown">📄 Eksportér .md</button>
        <button type="button" class="btn-primary" @click="print">🖨️ Udskriv / PDF</button>
      </template>
    </template>

    <p v-if="!person" class="text-stone-500">Personen blev ikke fundet.</p>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section class="panel flex gap-5 items-start">
        <PersonAvatar :person="person" :size="112" editable />
        <dl class="text-sm space-y-1.5">
          <div><dt class="inline font-semibold">Køn: </dt><dd class="inline">{{ person.køn ?? 'Ukendt' }}</dd></div>
          <div><dt class="inline font-semibold">Født: </dt><dd class="inline">{{ person.fødselsdato ? formatDato(person.fødselsdato) : 'Ukendt' }}<template v-if="person.fødselsogn"> i {{ person.fødselsogn }}</template></dd></div>
          <div><dt class="inline font-semibold">Død: </dt><dd class="inline">{{ person.dødsdato ? formatDato(person.dødsdato) : 'Levende/ukendt' }}<template v-if="person.dødssogn"> i {{ person.dødssogn }}</template></dd></div>
          <div v-if="alder"><dt class="inline font-semibold">Alder: </dt><dd class="inline">{{ alder }}</dd></div>
          <p v-if="person.noter" class="text-stone-500 whitespace-pre-line pt-2">{{ person.noter }}</p>
        </dl>
      </section>

      <section class="panel">
        <h2 class="section-title">🔗 Relationer</h2>
        <ul v-if="sætninger.length" class="text-sm space-y-1 list-disc pl-5">
          <li v-for="(s, i) in sætninger" :key="i">
            <router-link :to="`/kinmate/personer/${s.andenId}`" class="hover:text-accent">{{ s.tekst }}</router-link>
          </li>
        </ul>
        <p v-else class="text-sm text-stone-400">Ingen relationer registreret.</p>
      </section>

      <section class="panel print:hidden">
        <h2 class="section-title">🔎 Arkiv-opslag</h2>
        <p class="text-sm text-stone-500 mb-3">Åbner de danske arkiver. Søgeteksten (sogn og år) kopieres samtidig, så den er klar til søgefeltet.</p>
        <div class="flex flex-col gap-2">
          <button type="button" class="btn-secondary !justify-start" @click="åbnArkiv('https://arkivalieronline.rigsarkivet.dk/da/collection/theme/1', fødselsSøgeterm)">
            Arkivalieronline – kirkebøger (fødsel)
          </button>
          <button type="button" class="btn-secondary !justify-start" :disabled="!person.dødssogn" @click="åbnArkiv('https://arkivalieronline.rigsarkivet.dk/da/collection/theme/1', dødsSøgeterm)">
            Arkivalieronline – kirkebøger (død)
          </button>
          <button type="button" class="btn-secondary !justify-start" @click="åbnArkiv('https://soeg.rigsarkivet.dk/', fødselsSøgeterm)">
            Rigsarkivets samlinger (folketællinger m.m.)
          </button>
        </div>
        <p v-if="kopieret" class="text-xs text-accent mt-2">{{ kopieret }}</p>
      </section>

      <section class="panel">
        <h2 class="section-title">📚 Kilder ({{ mineKoblinger.length }})</h2>
        <ul v-if="mineKoblinger.length" class="divide-y divide-stone-100 text-sm mb-4">
          <li v-for="k in mineKoblinger" :key="k.id" class="flex items-start gap-2 py-2">
            <div class="flex-1 min-w-0">
              <strong>{{ k.kilde_titel }}</strong>
              <span v-if="k.felt" class="text-stone-500"> · {{ k.felt }}</span>
              <span v-if="k.sikkerhed" class="tag ml-2" :class="SIKKERHED[k.sikkerhed] ?? 'bg-stone-100'">{{ k.sikkerhed }}</span>
              <div v-if="k.noter" class="text-xs text-stone-500">{{ k.noter }}</div>
            </div>
            <button type="button" class="btn-icon print:hidden" aria-label="Fjern kilde" @click="run(() => kinApi.unlinkKilde(k.id))">✕</button>
          </li>
        </ul>
        <p v-else class="text-sm text-stone-400 mb-4">Ingen kilder tilknyttet endnu.</p>

        <form class="grid grid-cols-2 gap-2 print:hidden" @submit.prevent="tilføjKilde">
          <select v-model="nyKilde.id" class="field col-span-2 !py-1.5 text-sm">
            <option value="">Vælg eksisterende kilde</option>
            <option v-for="k in store.kilder" :key="k.id" :value="k.id">{{ k.titel }}</option>
            <option value="__ny__">+ Opret ny kilde …</option>
          </select>
          <input v-if="nyKilde.id === '__ny__'" v-model="nyKilde.titel" class="field col-span-2 !py-1.5 text-sm" placeholder="Titel, fx 'Kirkebog for Ribe, 1850'">
          <input v-model="nyKilde.felt" class="field !py-1.5 text-sm" placeholder="Understøtter felt" list="kin-felter">
          <datalist id="kin-felter">
            <option v-for="f in FELTER" :key="f" :value="f" />
          </datalist>
          <select v-model="nyKilde.sikkerhed" class="field !py-1.5 text-sm">
            <option value="sikker">Sikker</option>
            <option value="sandsynlig">Sandsynlig</option>
            <option value="gæt">Gæt</option>
          </select>
          <input v-model="nyKilde.noter" class="field !py-1.5 text-sm" placeholder="Noter (valgfrit)">
          <button type="submit" class="btn-secondary !py-1.5" :disabled="!nyKilde.id || (nyKilde.id === '__ny__' && !nyKilde.titel.trim())">+ Tilføj</button>
        </form>
      </section>

      <section class="panel lg:col-span-2">
        <h2 class="section-title">📝 Forskningslog ({{ åbneOpgaver }} åbne)</h2>
        <ul v-if="mineOpgaver.length" class="divide-y divide-stone-100 text-sm mb-4">
          <li v-for="o in mineOpgaver" :key="o.id" class="flex items-center gap-2 py-2">
            <span class="flex-1" :class="o.status === 'løst' && 'line-through text-stone-400'">{{ o.beskrivelse }}</span>
            <button type="button" class="btn-secondary !py-1 !px-2 !text-xs print:hidden" @click="run(() => kinApi.setOpgaveStatus(o.id, o.status === 'løst' ? 'åben' : 'løst'))">
              {{ o.status === 'løst' ? '↺ Genåbn' : '✓ Løst' }}
            </button>
            <ConfirmButton class="print:hidden" @confirm="run(() => kinApi.deleteOpgave(o.id))" />
          </li>
        </ul>
        <p v-else class="text-sm text-stone-400 mb-4">Ingen åbne spørgsmål. 🎉</p>
        <form class="flex gap-2 print:hidden" @submit.prevent="tilføjOpgave">
          <input v-model="nyOpgave" class="field !py-1.5 text-sm" placeholder="Fx 'mangler dåbsattest'">
          <button type="submit" class="btn-secondary !py-1.5 shrink-0" :disabled="!nyOpgave.trim()">+ Tilføj</button>
        </form>
      </section>
    </div>

    <Modal :open="editOpen" title="Rediger person" wide @close="editOpen = false">
      <PersonForm v-if="editOpen && person" :person="person" @saved="p => { editOpen = false; if (!p) router.push('/kinmate/personer') }" @close="editOpen = false" />
    </Modal>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import KinPage from '../components/KinPage.vue'
import PersonAvatar from '../components/PersonAvatar.vue'
import PersonForm from '../components/PersonForm.vue'
import { kinApi } from '../api'
import { useKinStore } from '../store'
import { beregnAlder, downloadTekst, filnavn, formatDato } from '../lib'
import { prep } from '../relationTypes'

const FELTER = ['navn', 'fødselsdato', 'fødselsogn', 'dødsdato', 'dødssogn', 'køn', 'generelt']
const SIKKERHED: Record<string, string> = { sikker: 'bg-emerald-50 text-emerald-700', sandsynlig: 'bg-amber-50 text-amber-700', 'gæt': 'bg-red-50 text-red-700' }

const route = useRoute()
const router = useRouter()
const store = useKinStore()
const personId = computed(() => String(route.params.personId))
const person = computed(() => store.persons.find(p => p.id === personId.value) ?? null)
const alder = computed(() => (person.value ? beregnAlder(person.value) : null))
const editOpen = ref(false)

async function run(fn: () => Promise<unknown>) {
  await fn()
  await store.loadAll()
}

const print = () => window.print()

async function eksporterMarkdown() {
  const { prompt } = await kinApi.prompt(personId.value)
  downloadTekst(`kinmate-${filnavn(person.value!.navn)}.md`, prompt, 'text/markdown;charset=utf-8')
}

// "er"/"var": datid, hvis den omtalte person er død
const erVar = (id: string) => (store.persons.find(p => p.id === id)?.dødsdato ? 'var' : 'er')
const sætninger = computed(() => {
  const p = person.value
  if (!p) return []
  return [
    ...store.relations.filter(r => r.person1_id === p.id)
      .map(r => ({ andenId: r.person2_id, tekst: `${p.navn} ${erVar(p.id)} ${r.type_} ${prep(r.type_)} ${r.person2_navn}` })),
    ...store.relations.filter(r => r.person2_id === p.id)
      .map(r => ({ andenId: r.person1_id, tekst: `${r.person1_navn} ${erVar(r.person1_id)} ${r.type_} ${prep(r.type_)} ${p.navn}` })),
  ]
})

// ── Arkiv-opslag ──
const kopieret = ref('')
const søgeterm = (sogn: string | null | undefined, dato: string | null | undefined) => [sogn, dato?.slice(0, 4)].filter(Boolean).join(' ')
const fødselsSøgeterm = computed(() => søgeterm(person.value?.fødselsogn, person.value?.fødselsdato))
const dødsSøgeterm = computed(() => søgeterm(person.value?.dødssogn, person.value?.dødsdato))
async function åbnArkiv(url: string, term: string) {
  if (term) {
    try {
      await navigator.clipboard.writeText(term)
      kopieret.value = `"${term}" er kopieret – sæt den ind i søgefeltet på siden.`
    } catch { /* udklipsholderen er ikke tilgængelig */ }
  }
  window.open(url, '_blank', 'noopener')
}

// ── Kilder ──
const mineKoblinger = computed(() => store.kildeKoblinger.filter(k => k.person_id === personId.value))
const nyKilde = reactive({ id: '', titel: '', felt: '', sikkerhed: 'sandsynlig', noter: '' })
async function tilføjKilde() {
  let kildeId = nyKilde.id
  if (kildeId === '__ny__') {
    kildeId = (await kinApi.createKilde({ titel: nyKilde.titel, type_: null, arkiv_reference: null, url: null, noter: null })).id
  }
  await run(() => kinApi.linkKilde({ kilde_id: kildeId, person_id: personId.value, felt: nyKilde.felt || null, sikkerhed: nyKilde.sikkerhed, noter: nyKilde.noter || null }))
  Object.assign(nyKilde, { id: '', titel: '', felt: '', noter: '' })
}

// ── Forskningslog ──
const mineOpgaver = computed(() => store.forskningsopgaver.filter(o => o.person_id === personId.value))
const åbneOpgaver = computed(() => mineOpgaver.value.filter(o => o.status !== 'løst').length)
const nyOpgave = ref('')
async function tilføjOpgave() {
  await run(() => kinApi.createOpgave(personId.value, nyOpgave.value))
  nyOpgave.value = ''
}
</script>
