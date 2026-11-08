<template>
  <div class="space-y-6">
    <section>
      <h2 class="section-title">Importér LinkedIn-forbindelser</h2>
      <div class="panel space-y-3">
        <p class="text-sm text-stone-500">
          Eksportér dine forbindelser fra LinkedIn (Settings → Get a copy of your data) og vælg filen "Connections.csv" her.
        </p>
        <div>
          <button type="button" class="btn-secondary" :disabled="importing" @click="fileInput?.click()">
            {{ importing ? 'Importerer …' : '📥 Vælg Connections.csv' }}
          </button>
          <input ref="fileInput" type="file" accept=".csv,text/csv" style="display: none" @change="importCsv">
        </div>
        <p v-if="importMessage" class="text-sm text-stone-600">{{ importMessage }}</p>
        <p v-if="importError" class="text-loss text-sm">{{ importError }}</p>
      </div>
    </section>

    <nav class="flex gap-1 border-b border-stone-200">
      <button type="button" class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px" :class="tab === 'berig' ? 'border-accent text-accent' : 'border-transparent text-stone-500'" @click="tab = 'berig'">Berig</button>
      <button type="button" class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px" :class="tab === 'alle' ? 'border-accent text-accent' : 'border-transparent text-stone-500'" @click="tab = 'alle'">Alle forbindelser</button>
    </nav>

    <section v-if="tab === 'berig'" class="space-y-4">
      <div v-if="fuzzyCandidates.length">
        <h3 class="section-title">Mulige match — skal godkendes</h3>
        <div class="space-y-2">
          <div v-for="c in fuzzyCandidates" :key="c.id" class="panel flex items-center justify-between gap-3">
            <div class="text-sm">
              <span class="font-semibold">{{ c.fornavn }} {{ c.efternavn }}</span>
              <span class="text-stone-500"> ligner </span>
              <span class="font-semibold">{{ contactName(c.fuzzy_kandidat_id) }}</span>
              <span class="tag bg-amber-100 text-amber-700 ml-2">{{ c.match_score }}%</span>
            </div>
            <div class="flex gap-1 shrink-0">
              <button type="button" class="btn-primary !text-xs !py-1" @click="approve(c)">✓ Godkend</button>
              <button type="button" class="btn-secondary !text-xs !py-1" @click="reject(c)">✕ Afvis</button>
              <button type="button" class="btn-icon" title="Skjul" @click="hide(c.id)">🙈</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 class="section-title">Kan berige kontakten med</h3>
        <p v-if="!enrichable.length" class="panel text-stone-500">Intet at berige lige nu.</p>
        <div v-else class="space-y-2">
          <div v-for="m in enrichable" :key="m.linkedin.id" class="panel space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold">{{ m.contact?.visningsnavn }}</span>
              <button type="button" class="btn-icon" title="Skjul" @click="hide(m.linkedin.id)">🙈</button>
            </div>
            <div class="flex flex-wrap gap-3 text-sm">
              <label v-if="m.new_fields.includes('firma')" class="flex items-center gap-1.5">
                <input v-model="enrichChoice[m.linkedin.id].firma" type="checkbox"> Firma: {{ m.linkedin.firma }}
              </label>
              <label v-if="m.new_fields.includes('titel')" class="flex items-center gap-1.5">
                <input v-model="enrichChoice[m.linkedin.id].titel" type="checkbox"> Titel: {{ m.linkedin.titel }}
              </label>
              <label v-if="m.new_fields.includes('email')" class="flex items-center gap-1.5">
                <input v-model="enrichChoice[m.linkedin.id].email" type="checkbox"> Email: {{ m.linkedin.email }}
              </label>
            </div>
            <button type="button" class="btn-primary !text-xs !py-1" @click="applyEnrich(m)">Anvend valgte</button>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="space-y-3">
      <input v-model="search" class="field" placeholder="Søg i LinkedIn-forbindelser …">
      <div class="panel !p-0 overflow-x-auto">
        <table class="table">
          <thead><tr><th>Navn</th><th>Firma</th><th>Forbundet</th><th>Match</th></tr></thead>
          <tbody>
            <tr v-for="c in filteredAll" :key="c.id">
              <td>{{ c.fornavn }} {{ c.efternavn }}</td>
              <td class="text-stone-500">{{ c.firma || '–' }}</td>
              <td class="text-stone-400 text-xs">{{ c.forbundet_den || '–' }}</td>
              <td>
                <span v-if="c.contact_id" class="text-gain text-sm">✓ {{ c.visningsnavn }}</span>
                <span v-else class="text-stone-400 text-sm">Ingen match</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { contactmateApi, type Contact, type LinkedInConnection, type LinkedInMatch } from '../api'

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importMessage = ref('')
const importError = ref('')

const tab = ref<'berig' | 'alle'>('berig')
const connections = ref<LinkedInConnection[]>([])
const enrichable = ref<LinkedInMatch[]>([])
const hidden = ref<Set<string>>(new Set())
const contacts = ref<Contact[]>([])
const search = ref('')

const enrichChoice = reactive<Record<string, { firma: boolean; titel: boolean; email: boolean }>>({})

const fuzzyCandidates = computed(() =>
  connections.value.filter(c => !hidden.value.has(c.id) && !c.contact_id && c.fuzzy_kandidat_id && c.match_score > 0),
)
const filteredAll = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return connections.value
  return connections.value.filter(c => `${c.fornavn} ${c.efternavn} ${c.firma ?? ''}`.toLowerCase().includes(q))
})

function contactName(id: string | null) {
  return contacts.value.find(c => c.id === id)?.visningsnavn ?? '(ukendt kontakt)'
}

async function loadAll() {
  const [conns, matches, hiddenIds, allContacts] = await Promise.all([
    contactmateApi.linkedInConnections(),
    contactmateApi.linkedInMatches(false),
    contactmateApi.hiddenLinkedInMatches(),
    contactmateApi.contacts(),
  ])
  connections.value = conns
  hidden.value = new Set(hiddenIds)
  contacts.value = allContacts
  enrichable.value = matches.filter(m => !hidden.value.has(m.linkedin.id))
  for (const m of enrichable.value) {
    if (!enrichChoice[m.linkedin.id]) enrichChoice[m.linkedin.id] = { firma: false, titel: false, email: false }
  }
}

async function importCsv(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  importing.value = true
  importMessage.value = ''
  importError.value = ''
  try {
    const status = await contactmateApi.importLinkedInCsv(await file.text())
    importMessage.value = `${status.importeret} forbindelser importeret · ${status.matches} matchet · ${status.ingen_match} uden match.`
    await loadAll()
  } catch (e) {
    importError.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

async function approve(c: LinkedInConnection) {
  await contactmateApi.approveLinkedInMatch(c.id, c.fuzzy_kandidat_id!)
  await loadAll()
}
async function reject(c: LinkedInConnection) {
  await contactmateApi.rejectLinkedInMatch(c.id)
  await loadAll()
}
async function hide(id: string) {
  await contactmateApi.hideLinkedInMatch(id)
  await loadAll()
}
async function applyEnrich(m: LinkedInMatch) {
  const choice = enrichChoice[m.linkedin.id]
  await contactmateApi.enrichFromLinkedIn({
    linkedin_id: m.linkedin.id, contact_id: m.contact!.id,
    enrich_firma: choice.firma, enrich_titel: choice.titel, enrich_email: choice.email,
  })
  await loadAll()
}

onMounted(loadAll)
</script>
