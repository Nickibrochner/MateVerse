<template>
  <ul class="space-y-2">
    <li v-for="row in rows" :key="row.label" class="text-sm">
      <div class="flex justify-between gap-2">
        <span class="truncate">{{ row.label }}</span>
        <span class="tabular-nums text-stone-600 shrink-0">{{ format(row.value) }}</span>
      </div>
      <div class="h-2 rounded-full bg-stone-100 mt-1 overflow-hidden">
        <div class="h-full rounded-full bg-accent" :style="{ width: `${max ? (Math.max(row.value, 0) / max) * 100 : 0}%` }" />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** Simpelt vandret søjlediagram – nok til fordelinger uden et chart-bibliotek. */
const props = defineProps<{ rows: { label: string; value: number }[]; format: (n: number) => string }>()
const max = computed(() => Math.max(0, ...props.rows.map(r => r.value)))
</script>
