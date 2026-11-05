<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="w-9 h-9 grid place-items-center rounded-lg text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
      :class="open && 'bg-white/10 text-white'"
      title="Skift mate"
      aria-label="Skift mate"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor" aria-hidden="true">
        <circle v-for="p in DOTS" :key="p.join()" :cx="p[0]" :cy="p[1]" r="2" />
      </svg>
    </button>

    <div v-if="open" class="panel !p-2 absolute right-0 top-full mt-2 w-72 z-50 text-stone-800">
      <router-link to="/" class="menu-item" @click="open = false">
        <span class="text-lg">🏠</span>
        <span class="font-semibold">Hubben</span>
      </router-link>
      <div class="my-1 border-t border-stone-100" />
      <component
        :is="m.href ? 'a' : m.status === 'ready' ? 'router-link' : 'div'"
        v-for="m in orderedMates"
        :key="m.id"
        :href="m.href"
        :target="m.href ? '_blank' : undefined"
        :rel="m.href ? 'noopener' : undefined"
        :to="!m.href && m.status === 'ready' ? `/${m.id}` : undefined"
        class="menu-item"
        :class="m.status !== 'ready' && 'opacity-50 cursor-default'"
        @click="m.status === 'ready' && (open = false)"
      >
        <span class="text-lg">{{ m.icon }}</span>
        <span class="font-semibold">{{ m.name }}</span>
        <span v-if="m.status !== 'ready'" class="ml-auto text-[11px] text-stone-400">Kommer</span>
      </component>
      <div class="my-1 border-t border-stone-100" />
      <router-link to="/indstillinger" class="menu-item" @click="open = false">
        <span class="text-lg">⚙️</span>
        <span class="font-semibold">Indstillinger</span>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { orderedMates } from '../lib/mateOrder'

const DOTS = [5, 12, 19].flatMap(x => [5, 12, 19].map(y => [x, y]))
const open = ref(false)
const root = ref<HTMLElement | null>(null)

// Lukkes ved klik udenfor eller Escape
const onClick = (e: MouseEvent) => { if (!root.value?.contains(e.target as Node)) open.value = false }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('click', onClick); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey) })
</script>

<style scoped>
.menu-item {
  @apply flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-stone-100;
}
</style>
