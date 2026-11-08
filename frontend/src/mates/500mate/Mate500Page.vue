<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
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
  { to: '/500mate', label: '🂡 Spil', view: () => import('./views/SpilView.vue') },
  { to: '/500mate/leaderboard', label: '🏆 Leaderboard', view: () => import('./views/LeaderboardView.vue') },
  { to: '/500mate/spillere', label: '👤 Spillere', view: () => import('./views/SpillereView.vue') },
  { to: '/500mate/regler', label: '📖 Regler', view: () => import('./views/ReglerView.vue') },
]
const VIEWS = new Map(LINKS.map(l => [l.to, defineAsyncComponent(l.view)]))

const route = useRoute()
const view = computed(() => VIEWS.get(route.path) ?? VIEWS.get('/500mate'))
</script>
