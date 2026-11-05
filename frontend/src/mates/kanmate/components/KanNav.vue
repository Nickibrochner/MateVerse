<template>
  <nav class="flex flex-wrap gap-1 border-b border-stone-200 -mx-1 px-1">
    <router-link
      v-for="l in LINKS"
      :key="l.to"
      :to="l.to"
      class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
      :class="isActive(l.to) ? 'border-accent text-accent' : 'border-transparent text-stone-500 hover:text-stone-800'"
    >{{ l.label }}</router-link>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const LINKS = [
  { to: '/kanmate', label: 'Projekter' },
  { to: '/kanmate/board', label: 'Board' },
  { to: '/kanmate/deadlines', label: 'Deadlines' },
  { to: '/kanmate/arkiv', label: 'Arkiv' },
  { to: '/kanmate/papirkurv', label: 'Papirkurv' },
]
const route = useRoute()
const isActive = (to: string) =>
  to === '/kanmate' ? route.path === '/kanmate' || route.path.startsWith('/kanmate/projekt') : route.path.startsWith(to)
</script>
