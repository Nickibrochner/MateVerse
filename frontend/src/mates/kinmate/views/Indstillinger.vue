<template>
  <KinPage title="Indstillinger">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section class="panel space-y-3">
        <h2 class="section-title !mb-0">💾 Backup</h2>
        <p class="text-sm text-stone-500">
          Hent alle personer, relationer, kilder og forskningsopgaver som én JSON-fil. Gendannelse kan også bruge en backup fra den gamle Tauri-udgave af KinMate.
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" :disabled="travlt" @click="lavBackup">Hent backup</button>
          <button type="button" class="btn-secondary" :disabled="travlt" @click="backupInput?.click()">Gendan fra fil …</button>
          <input ref="backupInput" type="file" accept="application/json" class="hidden" @change="gendan">
        </div>
        <p v-if="besked" class="text-sm">{{ besked }}</p>
      </section>

      <section class="panel space-y-3">
        <h2 class="section-title !mb-0">🌳 GEDCOM</h2>
        <p class="text-sm text-stone-500">
          Standardformatet for slægtsforskning (MyHeritage, Ancestry, Legacy m.fl.). Kun stamdata og familierelationer overføres. Kilder og forskningslog følger ikke med.
        </p>
        <div class="flex flex-wrap gap-2">
          <a :href="kinApi.gedcomUrl()" class="btn-primary" download>Eksportér til .ged</a>
          <button type="button" class="btn-secondary" :disabled="travlt" @click="gedcomInput?.click()">Importér fra .ged …</button>
          <input ref="gedcomInput" type="file" accept=".ged,text/plain" class="hidden" @change="importerGedcom">
        </div>
        <p v-if="gedcomBesked" class="text-sm">{{ gedcomBesked }}</p>
        <ul v-if="advarsler.length" class="text-xs text-amber-700 list-disc pl-5 max-h-40 overflow-y-auto">
          <li v-for="(a, i) in advarsler" :key="i">{{ a }}</li>
        </ul>
      </section>
    </div>
  </KinPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import KinPage from '../components/KinPage.vue'
import { kinApi } from '../api'
import { useKinStore } from '../store'
import { downloadTekst } from '../lib'

const store = useKinStore()
const travlt = ref(false)
const besked = ref('')
const gedcomBesked = ref('')
const advarsler = ref<string[]>([])
const backupInput = ref<HTMLInputElement | null>(null)
const gedcomInput = ref<HTMLInputElement | null>(null)

async function lavBackup() {
  travlt.value = true
  try {
    const data = await kinApi.backup()
    downloadTekst(`kinmate-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    besked.value = 'Backup hentet.'
  } catch (e) {
    besked.value = `Fejl: ${(e as Error).message}`
  } finally {
    travlt.value = false
  }
}

async function gendan(e: Event) {
  const input = e.target as HTMLInputElement
  const fil = input.files?.[0]
  input.value = ''
  if (!fil || !confirm('Gendannelse erstatter ALLE nuværende Kinmate-data med indholdet af filen. Fortsæt?')) return
  travlt.value = true
  try {
    const res = await kinApi.restore(JSON.parse(await fil.text()))
    besked.value = `Gendannet: ${res.personer} personer og ${res.relationer} relationer.`
    await store.loadAll()
  } catch (err) {
    besked.value = `Fejl ved gendannelse: ${(err as Error).message}`
  } finally {
    travlt.value = false
  }
}

async function importerGedcom(e: Event) {
  const input = e.target as HTMLInputElement
  const fil = input.files?.[0]
  input.value = ''
  if (!fil || !confirm('Personer og relationer fra filen tilføjes til de nuværende data (intet erstattes). Fortsæt?')) return
  travlt.value = true
  try {
    const res = await kinApi.importGedcom(await fil.text())
    gedcomBesked.value = `Importeret: ${res.personer} personer og ${res.relationer} relationer.`
    advarsler.value = res.advarsler
    await store.loadAll()
  } catch (err) {
    gedcomBesked.value = `Fejl ved import: ${(err as Error).message}`
  } finally {
    travlt.value = false
  }
}
</script>
