<template>
  <button
    type="button"
    class="btn-icon inline-grid"
    :class="armed && '!bg-loss !text-white'"
    :title="armed ? 'Klik igen for at bekræfte' : label"
    :aria-label="armed ? `Bekræft: ${label}` : label"
    @click="click"
    @blur="armed = false"
  ><slot>🗑</slot></button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/** Knap, der kræver to klik – første klik markerer, andet udfører. */
withDefaults(defineProps<{ label?: string }>(), { label: 'Slet' })
const emit = defineEmits<{ confirm: [] }>()
const armed = ref(false)

function click() {
  if (!armed.value) {
    armed.value = true
    return
  }
  armed.value = false
  emit('confirm')
}
</script>
