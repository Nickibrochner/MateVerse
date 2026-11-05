<template>
  <KinPage title="Personer">
    <template #actions>
      <button type="button" class="btn-primary" @click="openForm(null)">+ Tilføj person</button>
    </template>

    <div v-if="pådenneDag.length" class="panel !py-3 flex items-start gap-3 bg-accent-soft border-accent/20">
      <span class="text-xl">📅</span>
      <ul class="text-sm space-y-0.5">
        <li v-for="(tekst, i) in pådenneDag" :key="i">{{ tekst }}</li>
      </ul>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <input v-model="søgning" class="field max-w-sm" placeholder="Søg efter navn, sogn eller noter …">
      <span class="text-sm text-stone-500">
        {{ viste.length }} / {{ store.persons.length }} personer
        <template v-if="store.relations.length"> · {{ primæreRelationer }} primære relationer</template>
      </span>
    </div>

    <p v-if="!store.persons.length" class="text-stone-500">Ingen personer endnu – tilføj den første, eller importér en GEDCOM-fil under Indstillinger.</p>
    <p v-else-if="!viste.length" class="text-stone-500">Ingen personer matcher søgningen.</p>

    <ul v-else class="panel !p-0 divide-y divide-stone-100">
      <li
        v-for="p in viste"
        :key="p.id"
        :ref="el => { if (el) rækker[p.id] = el as HTMLElement }"
        class="flex items-center gap-3 px-4 py-3 transition-colors"
        :class="p.id === fremhævet && 'bg-accent-soft'"
      >
        <PersonAvatar :person="p" editable />
        <div class="min-w-0 flex-1">
          <router-link :to="`/kinmate/personer/${p.id}`" class="font-semibold hover:text-accent">{{ p.navn }}</router-link>
          <div class="text-xs text-stone-500 flex flex-wrap gap-x-3">
            <span v-if="p.fødselsdato">🎂 {{ formatDato(p.fødselsdato) }}</span>
            <span v-if="p.dødsdato">✝ {{ formatDato(p.dødsdato) }}</span>
            <span v-if="beregnAlder(p)" class="tag !normal-case !tracking-normal" :class="p.dødsdato ? 'bg-stone-100 text-stone-500' : 'bg-accent-soft text-accent'">{{ beregnAlder(p) }}</span>
            <span v-if="p.køn">{{ kønIkon(p.køn) }}</span>
          </div>
          <div v-if="p.noter" class="text-xs text-stone-400 truncate">{{ p.noter }}</div>
        </div>
        <router-link
          :to="{ path: '/kinmate/relationer', query: { person: p.id } }"
          class="tag !normal-case !tracking-normal shrink-0"
          :class="antal(p.id) ? 'bg-stone-100 text-stone-600' : 'bg-amber-50 text-amber-700'"
          :title="antal(p.id) ? `${antal(p.id)} relationer` : 'Ingen relationer'"
        >🔗 {{ antal(p.id) }}</router-link>
        <button type="button" class="btn-icon" title="Kopiér AI-prompt" aria-label="Kopiér AI-prompt" @click="kopierPrompt(p)">🤖</button>
        <button type="button" class="btn-icon" title="Rediger" aria-label="Rediger" @click="openForm(p)">✎</button>
      </li>
    </ul>

    <Modal :open="formOpen" :title="editing ? 'Rediger person' : 'Ny person'" wide @close="formOpen = false">
      <PersonForm v-if="formOpen" :person="editing" @saved="formOpen = false" @close="formOpen = false" />
    </Modal>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import KinPage from '../components/KinPage.vue'
import PersonAvatar from '../components/PersonAvatar.vue'
import PersonForm from '../components/PersonForm.vue'
import { kinApi, type Person } from '../api'
import { useKinStore } from '../store'
import { beregnAlder, formatDato, kønIkon } from '../lib'

const store = useKinStore()
const route = useRoute()
const søgning = ref('')
const fremhævet = computed(() => (route.query.fremhæv as string | undefined) ?? '')

const viste = computed(() => {
  const q = søgning.value.trim().toLowerCase()
  if (!q) return store.persons
  return store.persons.filter(p => [p.navn, p.fødselsogn, p.dødssogn, p.noter].some(s => s?.toLowerCase().includes(q)))
})
const primæreRelationer = computed(() => store.relations.filter(r => r.noter !== 'Auto-oprettet modpart').length)
const antal = (id: string) => store.relations.filter(r => r.person1_id === id || r.person2_id === id).length

// ── Formular ──
const formOpen = ref(false)
const editing = ref<Person | null>(null)
function openForm(p: Person | null) {
  editing.value = p
  formOpen.value = true
}

// ── AI-prompt ──
async function kopierPrompt(p: Person) {
  try {
    const { prompt } = await kinApi.prompt(p.id)
    await navigator.clipboard.writeText(prompt)
    alert(`Prompt for ${p.navn} er kopieret til udklipsholderen.`)
  } catch (e) {
    alert(`Kunne ikke lave prompten: ${(e as Error).message}`)
  }
}

// ── Fremhæv og rul til en person (fx fra familietræet) ──
const rækker: Record<string, HTMLElement> = {}
watch([fremhævet, () => store.loaded], ([id]) => {
  if (id) nextTick(() => rækker[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}, { immediate: true })

// ── På denne dag ──
const pådenneDag = computed(() => {
  const nu = new Date()
  const mmdd = `${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`
  const ud: string[] = []
  for (const p of store.persons) {
    if (p.fødselsdato && p.fødselsdato.length >= 10 && p.fødselsdato.slice(5, 10) === mmdd) {
      const år = parseInt(p.fødselsdato.slice(0, 4))
      ud.push(p.dødsdato ? `🎂 ${p.navn} blev født i dag (${år})` : `🎂 ${p.navn} fylder ${nu.getFullYear() - år} år i dag`)
    }
    if (p.dødsdato && p.dødsdato.length >= 10 && p.dødsdato.slice(5, 10) === mmdd) {
      const siden = nu.getFullYear() - parseInt(p.dødsdato.slice(0, 4))
      ud.push(siden > 0 ? `✝ Det er i dag ${siden} år siden ${p.navn} døde` : `✝ ${p.navn} døde i dag`)
    }
  }
  return ud
})
</script>
