<template>
  <div class="mx-auto px-4 py-8 space-y-6" :class="wide ? 'max-w-[96rem]' : 'max-w-6xl'">
    <div class="flex flex-wrap items-end justify-between gap-4 print:hidden">
      <h1 class="text-3xl font-bold">{{ title }}</h1>
      <div class="flex flex-wrap gap-2"><slot name="actions" /></div>
    </div>
    <KinNav />
    <p v-if="store.error" class="panel text-loss">{{ store.error }}</p>
    <p v-else-if="!store.loaded" class="text-stone-400">Henter …</p>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import KinNav from './KinNav.vue'
import { useKinStore } from '../store'

/** Fælles ramme for Kinmates sider: titel, faner og indlæsning af data. */
defineProps<{ title: string; wide?: boolean }>()
const store = useKinStore()
store.ensureLoaded()
</script>
