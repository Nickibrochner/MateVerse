<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Importér</h1>
    </div>

    <div class="form-card">
      <h2>Importér UDisc CSV</h2>
      <p class="hint">
        Vælg en eller flere scorecard-CSV'er eksporteret fra UDisc. Filen skal indeholde en "Par"-række
        der definerer bane/layout, samt kolonnerne <code>PlayerName</code>, <code>CourseName</code>,
        <code>LayoutName</code>, <code>StartDate</code> og <code>Hole1…HoleN</code>.
        Runder der allerede er importeret (samme spiller, layout og dato) springes automatisk over.
      </p>

      <div class="form-actions">
        <button class="btn btn-accent" :disabled="isImporting" @click="input?.click()">
          {{ isImporting ? 'Importerer…' : '📥 Vælg CSV-fil(er)' }}
        </button>
        <input ref="input" type="file" accept=".csv,text/csv" multiple style="display: none" @change="importFiles">
      </div>

      <p v-if="message" class="success-msg">{{ message }}</p>
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </div>

    <div class="form-card">
      <h2>Automatisk import fra Google Drive</h2>
      <p class="hint">
        Tauri-udgaven kunne hente nye UDisc-eksporter fra en mappe på Google Drive ved opstart.
        Den funktion er ikke flyttet med til MateVerse endnu – indtil da importeres filerne her.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '../invoke'
import type { ImportSummary } from '../types'

const emit = defineEmits<{ imported: [] }>()

const input = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)
const message = ref('')
const errorMsg = ref('')

async function importFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  if (input.value) input.value.value = ''
  if (!files.length) return
  errorMsg.value = ''
  message.value = ''
  isImporting.value = true
  let rounds = 0
  let skipped = 0
  const errors: string[] = []
  for (const file of files) {
    try {
      const summary = await invoke<ImportSummary>('import_csv', { content: await file.text() })
      rounds += summary.imported_rounds
      skipped += summary.skipped_duplicates
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  isImporting.value = false
  if (files.length > errors.length) {
    message.value = `Importerede ${rounds} runder (${skipped} dubletter sprunget over).`
    emit('imported')
  }
  errorMsg.value = errors.join(' · ')
}
</script>
