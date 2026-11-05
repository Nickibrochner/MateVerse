<template>
  <svg :width="size" :height="size" viewBox="0 0 40 40" class="shrink-0" role="img" :aria-label="`${Math.round(value * 100)} %`">
    <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="4" class="text-stone-100" />
    <circle
      cx="20" cy="20" r="16" fill="none" stroke-width="4" stroke-linecap="round"
      class="stroke-accent -rotate-90 origin-center transition-all"
      :stroke-dasharray="`${Math.max(0, Math.min(1, value)) * 100.53} 100.53`"
    />
    <text x="20" y="20" text-anchor="middle" dominant-baseline="central" class="fill-stone-800 font-semibold" style="font-size: 9px">
      {{ Math.round(value * 100) }}%
    </text>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ value: number; size?: number }>(), { size: 56 })
</script>
