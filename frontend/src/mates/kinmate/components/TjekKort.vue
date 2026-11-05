<template>
  <div class="panel !p-4" :class="antal === 0 && 'opacity-70'">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-sans font-semibold text-sm text-stone-800 tracking-normal">{{ titel }}</h3>
      <span class="tag" :class="antal === 0 ? 'bg-emerald-50 text-emerald-700' : alvorlig ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'">{{ antal }}</span>
    </div>
    <div v-if="antal" class="mt-2"><slot /></div>
    <p v-else class="text-xs text-emerald-700 mt-1">{{ ok }} ✓</p>
    <p v-if="hjælp" class="text-xs text-stone-400 mt-2">{{ hjælp }}</p>
  </div>
</template>

<script setup lang="ts">
/** Et datakvalitets-tjek: titel, antal fund og en liste, når der er nogen. */
defineProps<{ titel: string; antal: number; ok: string; hjælp?: string; alvorlig?: boolean }>()
</script>
