<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Indstillinger</h1>
    </div>

    <div class="settings-tabs">
      <button
        class="btn"
        :class="activeTab === 'layouts' ? 'btn-accent' : 'btn-subtle'"
        @click="activeTab = 'layouts'"
      >
        🛠️ Layouts
      </button>
      <button
        class="btn"
        :class="activeTab === 'discs' ? 'btn-accent' : 'btn-subtle'"
        @click="activeTab = 'discs'"
      >
        🥏 Ny disc
      </button>
      <button
        class="btn"
        :class="activeTab === 'import' ? 'btn-accent' : 'btn-subtle'"
        @click="activeTab = 'import'"
      >
        📥 Importér
      </button>
      <button
        class="btn"
        :class="activeTab === 'backup' ? 'btn-accent' : 'btn-subtle'"
        @click="activeTab = 'backup'"
      >
        💾 Backup
      </button>
    </div>

    <LayoutsView v-if="activeTab === 'layouts'" />
    <AddDiscView v-if="activeTab === 'discs'" />
    <ImportView v-if="activeTab === 'import'" @imported="emit('imported')" />
    <BackupView v-if="activeTab === 'backup'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LayoutsView from './LayoutsView.vue'
import AddDiscView from './AddDiscView.vue'
import ImportView from './ImportView.vue'
import BackupView from './BackupView.vue'

const emit = defineEmits<{ imported: [] }>()

const activeTab = ref<'layouts' | 'discs' | 'import' | 'backup'>('layouts')
</script>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
</style>
