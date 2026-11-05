<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-stone-900 text-stone-100 border-b-4 border-accent">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <router-link to="/" class="font-display text-lg font-bold tracking-tight hover:text-white flex items-center gap-2">
          <span class="grid place-items-center w-7 h-7 rounded-md bg-stone-700 text-sm">MV</span>
          MateVerse
        </router-link>
        <template v-if="mate">
          <span class="text-stone-500">/</span>
          <router-link :to="`/${mate.id}`" class="font-display font-semibold hover:text-white flex items-center gap-1.5">
            <span>{{ mate.icon }}</span>{{ mate.name }}
          </router-link>
        </template>

        <nav class="ml-auto flex items-center gap-1">
          <MateSwitcher />
        </nav>
      </div>
    </header>

    <main class="flex-1">
      <router-view />
    </main>

    <footer class="text-center text-xs text-stone-400 py-6">MateVerse · ét sted til alle dine mates</footer>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { findMate } from './mates'
import MateSwitcher from './components/MateSwitcher.vue'
import { useUsersStore } from './stores/users'

// Brugerne er fælles for alle mates og hentes én gang
useUsersStore().load()

const route = useRoute()
const mate = computed(() => findMate(route.meta.mate))

// Accentfarven følger den aktive mate (se tailwind.config.js)
watchEffect(() => {
  const root = document.documentElement.style
  if (mate.value) {
    root.setProperty('--accent', mate.value.accent)
    root.setProperty('--accent-soft', mate.value.accentSoft)
    document.title = `${mate.value.name} · MateVerse`
  } else {
    root.removeProperty('--accent')
    root.removeProperty('--accent-soft')
    document.title = 'MateVerse'
  }
})
</script>
