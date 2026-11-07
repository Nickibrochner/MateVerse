<template>
  <div>
    <div class="form-card">
      <h2>Sikkerhedskopiér data</h2>
      <p class="hint">
        Henter alle DiskMates data som én JSON-fil – baner, layouts, huller, runder og diske.
        Hele MateVerse-databasen ligger desuden i <code>data/mateverse.sqlite</code> på serveren.
      </p>
      <div class="form-actions">
        <button class="btn btn-accent" :disabled="backingUp" @click="backupDatabase">
          {{ backingUp ? 'Kopierer…' : '💾 Hent backup' }}
        </button>
      </div>
    </div>

    <div class="form-card">
      <h2>Eksportér alt som JSON</h2>
      <p class="hint">
        Samme rige eksport som findes pr. spiller under <strong>Spiller</strong>, men for
        alle spillere på én gang — hele hul-for-hul-historikken, klar til en LLM eller anden analyse.
      </p>
      <div class="form-actions">
        <button class="btn btn-accent" :disabled="exportingAll" @click="exportAll">
          {{ exportingAll ? 'Eksporterer…' : '⬇️ Eksportér alt' }}
        </button>
      </div>
    </div>

    <div class="form-card">
      <h2>Eksportér Caddiebog som JSON</h2>
      <p class="hint">
        Samler taktiske scouting-noter for alle fysiske huller på tværs af alle baner — par,
        længde, højdeforskel, fairway-type, kastelinje, underlag, taktik og noter — i én fil,
        klar til en LLM eller anden analyse.
      </p>
      <div class="form-actions">
        <button class="btn btn-accent" :disabled="exportingCaddie" @click="exportCaddieBook">
          {{ exportingCaddie ? 'Eksporterer…' : '⬇️ Eksportér Caddiebog' }}
        </button>
      </div>
    </div>

    <div class="form-card">
      <h2>Importér Caddiebog som JSON</h2>
      <p class="hint">
        Indlæs en kopi af en caddiebog – eksporteret herfra eller fra Tauri-udgaven af DiskMate.
        Rækker matches på banenavn og hul-label; findes banen eller hullet ikke her i forvejen,
        springes rækken over i stedet for at gætte en ny bane. Findes (hul, tee-farve) allerede,
        overskrives den med den importerede note.
      </p>
      <div class="form-actions">
        <button class="btn btn-accent" :disabled="importingCaddie" @click="caddieInput?.click()">
          {{ importingCaddie ? 'Importerer…' : '📥 Vælg Caddiebog-fil' }}
        </button>
        <input ref="caddieInput" type="file" accept=".json,application/json" style="display: none" @change="importCaddieBook">
      </div>
    </div>

    <p v-if="message" class="success-msg">{{ message }}</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { downloadJson, invoke, errText } from '../invoke'

const backingUp = ref(false)
const exportingAll = ref(false)
const exportingCaddie = ref(false)
const importingCaddie = ref(false)
const caddieInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const errorMsg = ref('')

async function backupDatabase() {
  message.value = ''
  errorMsg.value = ''
  backingUp.value = true
  try {
    downloadJson(`diskmate-backup-${todayStamp()}.json`, await invoke('backup_database'))
    message.value = 'Backup hentet.'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : errText(e)
  } finally {
    backingUp.value = false
  }
}

async function exportAll() {
  message.value = ''
  errorMsg.value = ''
  exportingAll.value = true
  try {
    downloadJson(`diskmate-alle-spillere-${todayStamp()}.json`, await invoke('export_all_json'))
    message.value = 'Alt data er eksporteret.'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : errText(e)
  } finally {
    exportingAll.value = false
  }
}

async function exportCaddieBook() {
  message.value = ''
  errorMsg.value = ''
  exportingCaddie.value = true
  try {
    downloadJson(`diskmate-caddiebog-${todayStamp()}.json`, await invoke('export_caddie_book'))
    message.value = 'Caddiebog eksporteret.'
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    exportingCaddie.value = false
  }
}

async function importCaddieBook(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (caddieInput.value) caddieInput.value.value = ''
  if (!file) return
  message.value = ''
  errorMsg.value = ''
  importingCaddie.value = true
  try {
    const entries = JSON.parse(await file.text())
    if (!Array.isArray(entries)) throw new Error('Filen indeholder ikke en liste af caddiebog-rækker')
    const summary = await invoke<{ imported: number; skipped: string[] }>('import_caddie_book', { entries })
    message.value = summary.skipped.length
      ? `Importerede ${summary.imported} rækker (${summary.skipped.length} sprunget over: ${summary.skipped.join(' · ')})`
      : `Importerede ${summary.imported} rækker.`
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    importingCaddie.value = false
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}
</script>

<style scoped>
.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.success-msg {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-top: 12px;
  font-size: 13px;
}
</style>
