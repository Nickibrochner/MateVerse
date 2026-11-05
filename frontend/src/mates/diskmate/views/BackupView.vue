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

    <p v-if="message" class="success-msg">{{ message }}</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { downloadJson, invoke, errText } from '../invoke'

const backingUp = ref(false)
const exportingAll = ref(false)
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
