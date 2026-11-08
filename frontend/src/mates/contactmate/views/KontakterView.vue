<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-3">
      <input v-model="search" class="field flex-1 min-w-[12rem]" placeholder="Søg på navn, firma, email eller telefon …" @input="debouncedLoad">
      <select v-model="groupId" class="field !w-auto" @change="load">
        <option value="">Alle grupper</option>
        <option v-for="g in groups" :key="g.google_id" :value="g.google_id">{{ g.navn }}</option>
      </select>
      <div class="flex gap-2">
        <a :href="exportCsvUrl" class="btn-secondary">📄 CSV</a>
        <a :href="exportVcardUrl" class="btn-secondary">📇 vCard</a>
      </div>
    </div>

    <p v-if="loading" class="text-stone-500 py-6 text-center">Henter …</p>
    <p v-else-if="!contacts.length" class="panel text-stone-500">Ingen kontakter fundet. Forbind Google Contacts under Indstillinger og synkronisér.</p>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <button
        v-for="c in contacts" :key="c.id" type="button"
        class="panel text-left hover:border-accent transition-colors flex items-start gap-3"
        @click="openContact(c.id)"
      >
        <div class="w-10 h-10 rounded-full bg-accent/10 text-accent font-display font-bold grid place-items-center shrink-0 overflow-hidden">
          <img v-if="c.foto_url" :src="c.foto_url" class="w-full h-full object-cover" alt="">
          <span v-else>{{ initials(c.visningsnavn) }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-stone-900 truncate">{{ c.visningsnavn }}</p>
          <p class="text-xs text-stone-500 truncate">{{ [c.firma, c.titel].filter(Boolean).join(' · ') || '–' }}</p>
          <p v-if="c.sidst_kontakt_at" class="text-xs text-stone-400 mt-1">📧 {{ sidstKontaktLabel(c.sidst_kontakt_at) }}</p>
          <p v-if="c.ny_fra_google" class="text-xs text-sky-600 mt-1">🆕 Ny</p>
        </div>
      </button>
    </div>

    <ContactDetailModal v-if="openId" :contact-id="openId" @close="openId = null" @changed="load" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { contactmateApi, type Contact, type Group } from '../api'
import { syncTick } from '../syncBus'
import ContactDetailModal from '../components/ContactDetailModal.vue'

const contacts = ref<Contact[]>([])
const groups = ref<Group[]>([])
const search = ref('')
const groupId = ref('')
const loading = ref(false)
const openId = ref<string | null>(null)

const exportCsvUrl = contactmateApi.exportCsvUrl()
const exportVcardUrl = contactmateApi.exportVcardUrl()

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
}

function sidstKontaktLabel(iso: string) {
  const dage = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dage < 1) return 'i dag'
  if (dage < 14) return `${dage} dage siden`
  if (dage < 60) return `${Math.floor(dage / 7)} uger siden`
  if (dage < 730) return `${Math.floor(dage / 30)} måneder siden`
  return `${Math.floor(dage / 365)} år siden`
}

async function load() {
  loading.value = true
  try {
    contacts.value = await contactmateApi.contacts(search.value || undefined, groupId.value || undefined)
  } finally {
    loading.value = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 250)
}

function openContact(id: string) {
  openId.value = id
}

watch(syncTick, load)

onMounted(async () => {
  groups.value = await contactmateApi.groups()
  await load()
})
</script>
