<template>
  <aside class="w-56 shrink-0 bg-stone-900 text-stone-100 flex flex-col h-screen sticky top-0">
    <router-link to="/" class="flex items-center gap-2 px-4 h-14 border-b border-stone-800 font-display text-lg font-bold shrink-0">
      <span class="grid place-items-center w-7 h-7 rounded-md bg-stone-700 text-sm">MV</span>
      MateVerse
    </router-link>

    <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
      <component
        :is="m.href ? 'a' : m.status === 'ready' ? 'router-link' : 'div'"
        v-for="m in orderedMates"
        :key="m.id"
        :href="m.href"
        :target="m.href ? '_blank' : undefined"
        :rel="m.href ? 'noopener' : undefined"
        :to="!m.href && m.status === 'ready' ? `/${m.id}` : undefined"
        class="nav-link flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm"
        :class="m.status === 'ready' ? 'text-stone-300 hover:bg-white/10 hover:text-white' : 'text-stone-600 cursor-default'"
      >
        <span class="text-base">{{ m.icon }}</span>
        <span class="truncate">{{ m.name }}</span>
        <span v-if="m.status !== 'ready'" class="ml-auto text-[10px] text-stone-500">Kommer</span>
      </component>
    </nav>

    <router-link to="/indstillinger" class="nav-link flex items-center gap-2.5 px-3 py-2.5 m-2 rounded-lg text-sm text-stone-300 hover:bg-white/10 hover:text-white border-t border-stone-800 pt-4">
      <span class="text-base">⚙️</span>
      <span>Indstillinger</span>
    </router-link>
  </aside>
</template>

<script setup lang="ts">
import { orderedMates } from '../lib/mateOrder'
</script>

<style scoped>
.nav-link.router-link-exact-active {
  background: rgb(255 255 255 / 0.1);
  color: white;
  font-weight: 600;
}
</style>
