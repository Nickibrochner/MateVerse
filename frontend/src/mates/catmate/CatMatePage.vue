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
    <component :is="view" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const LINKS = [
  { to: '/catmate', label: '🗺️ Kort', view: () => import('./views/KortView.vue') },
  { to: '/catmate/indsigt', label: '📊 Indsigt', view: () => import('./views/IndsigtView.vue') },
  { to: '/catmate/indstillinger', label: '⚙️ Indstillinger', view: () => import('./views/IndstillingerView.vue') },
]
const VIEWS = new Map(LINKS.map(l => [l.to, defineAsyncComponent(l.view)]))

const route = useRoute()
const view = computed(() => VIEWS.get(route.path) ?? VIEWS.get('/catmate'))
</script>
