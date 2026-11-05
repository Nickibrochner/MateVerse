<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <nav class="flex flex-wrap gap-1 border-b border-stone-200 -mx-1 px-1">
      <router-link
        v-for="l in LINKS"
        :key="l.to"
        :to="l.to"
        class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap"
        :class="route.path === l.to ? 'border-accent text-accent' : 'border-transparent text-stone-500 hover:text-stone-800'"
      >{{ l.label }}</router-link>
    </nav>
    <!-- Siderne fra Tauri-udgaven bruger Fluent-klasser, som diskmate.css afgrænser til denne ramme -->
    <div class="diskmate" :style="{ '--accent-rgb': mate?.accent }">
      <SettingsView v-if="route.path === '/diskmate/indstillinger'" @imported="router.push('/diskmate')" />
      <component :is="view" v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { findMate } from '../../mates'
import SettingsView from './views/SettingsView.vue'
import './diskmate.css'

const LINKS = [
  { to: '/diskmate', label: '📊 Statistik', view: () => import('./views/StatsView.vue') },
  { to: '/diskmate/spiller', label: '👤 Spiller', view: () => import('./views/PlayerView.vue') },
  { to: '/diskmate/grupperunder', label: '🏆 Grupperunder', view: () => import('./views/SessionsView.vue') },
  { to: '/diskmate/huller', label: '⛳ Huller', view: () => import('./views/HolesView.vue') },
  { to: '/diskmate/diske', label: '🥏 Diskkartotek', view: () => import('./views/DiscsView.vue') },
  { to: '/diskmate/indstillinger', label: '⚙️ Indstillinger', view: null },
]
// Indstillinger vises direkte i skabelonen, fordi den sender 'imported' videre
const VIEWS = new Map(LINKS.filter(l => l.view).map(l => [l.to, defineAsyncComponent(l.view!)]))

const route = useRoute()
const router = useRouter()
const mate = findMate('diskmate')
const view = computed(() => VIEWS.get(route.path) ?? VIEWS.get('/diskmate'))
</script>
