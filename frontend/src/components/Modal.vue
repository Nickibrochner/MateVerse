<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 bg-stone-900/40 grid place-items-center p-4" @mousedown.self="$emit('close')">
      <div class="panel w-full max-h-[90vh] overflow-y-auto" :class="wide ? 'max-w-2xl' : 'max-w-lg'" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">{{ title }}</h2>
          <button type="button" class="btn-icon" aria-label="Luk" @click="$emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ open: boolean; title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>
