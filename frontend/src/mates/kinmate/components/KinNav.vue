<template>
  <nav class="flex flex-wrap gap-1 border-b border-stone-200 -mx-1 px-1 print:hidden">
    <router-link
      v-for="l in LINKS"
      :key="l.to"
      :to="l.to"
      class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap"
      :class="isActive(l.to) ? 'border-accent text-accent' : 'border-transparent text-stone-500 hover:text-stone-800'"
    >
      {{ l.label }}
      <span v-if="l.badge && l.badge() > 0" class="tag !text-[10px] !px-1.5 bg-amber-100 text-amber-800">{{ l.badge() }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useKinStore } from '../store'

const store = useKinStore()
const LINKS: { to: string; label: string; badge?: () => number }[] = [
  { to: '/kinmate', label: '🌳 Familietræ' },
  { to: '/kinmate/anecirkel', label: 'Anecirkel' },
  { to: '/kinmate/kort', label: 'Kort' },
  { to: '/kinmate/tidslinje', label: 'Tidslinje' },
  { to: '/kinmate/personer', label: 'Personer' },
  { to: '/kinmate/relationer', label: 'Relationer' },
  { to: '/kinmate/datakvalitet', label: 'Datakvalitet', badge: () => store.kvalitetAdvarsel },
  { to: '/kinmate/kilder', label: 'Kilder', badge: () => store.åbneForskningsopgaver },
  { to: '/kinmate/indstillinger', label: 'Indstillinger' },
]
const route = useRoute()
const isActive = (to: string) => (to === '/kinmate' ? route.path === '/kinmate' : route.path.startsWith(to))
</script>
