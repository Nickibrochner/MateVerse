<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <nav class="flex flex-wrap gap-1 border-b border-stone-200 -mx-1 px-1">
        <router-link
          v-for="l in LINKS"
          :key="l.to"
          :to="l.to"
          class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap"
          :class="route.path === l.to ? 'border-accent text-accent' : 'border-transparent text-stone-500 hover:text-stone-800'"
        >{{ l.label }}</router-link>
      </nav>
      <button
        type="button" class="btn-secondary shrink-0" :disabled="syncing"
        :title="!settings?.contacts.forbundet ? 'Forbind Google Contacts under Indstillinger først' : ''"
        @click="runSync"
      >{{ syncing ? 'Synkroniserer …' : '↻ Synkroniser' }}</button>
    </div>

    <p v-if="syncMessage" class="panel text-sm">{{ syncMessage }}</p>

    <component :is="view" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { contactmateApi, type ContactMateSettings } from './api'
import { bumpSync } from './syncBus'

const LINKS = [
  { to: '/contactmate', label: '👥 Kontakter', view: () => import('./views/KontakterView.vue') },
  { to: '/contactmate/dubletter', label: '🧬 Dubletter', view: () => import('./views/DubletterView.vue') },
  { to: '/contactmate/linkedin', label: '🔗 LinkedIn', view: () => import('./views/LinkedInView.vue') },
  { to: '/contactmate/indstillinger', label: '⚙️ Indstillinger', view: () => import('./views/IndstillingerView.vue') },
]
const VIEWS = new Map(LINKS.map(l => [l.to, defineAsyncComponent(l.view)]))

const route = useRoute()
const view = computed(() => VIEWS.get(route.path) ?? VIEWS.get('/contactmate'))

const settings = ref<ContactMateSettings | null>(null)
const syncing = ref(false)
const syncMessage = ref('')

async function loadSettings() {
  settings.value = await contactmateApi.settings()
}

async function runSync() {
  if (!settings.value) await loadSettings()
  if (!settings.value?.contacts.forbundet) {
    syncMessage.value = 'Forbind Google Contacts under Indstillinger først.'
    return
  }

  syncing.value = true
  syncMessage.value = ''
  const dele: string[] = []
  try {
    try {
      dele.push((await contactmateApi.syncPush()).besked)
    } catch (e) {
      dele.push(`Push fejlede: ${(e as Error).message}`)
    }
    try {
      dele.push((await contactmateApi.syncPull()).besked)
    } catch (e) {
      dele.push(`Pull fejlede: ${(e as Error).message}`)
    }
    if (settings.value?.gmail.forbundet) {
      try {
        dele.push((await contactmateApi.syncGmail()).besked)
      } catch (e) {
        dele.push(`Gmail-sync fejlede: ${(e as Error).message}`)
      }
    }
    syncMessage.value = dele.join(' · ')
    bumpSync()
  } finally {
    syncing.value = false
  }
}

onMounted(loadSettings)
</script>
