<template>
  <select :value="modelValue" class="field !w-auto" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
    <optgroup v-for="g in relationGrupper" :key="g.label" :label="g.label">
      <option v-for="t in g.typer" :key="t" :value="t">{{ t }}</option>
    </optgroup>
    <option v-if="!kendt" :value="modelValue">{{ modelValue }}</option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { relationGrupper } from '../relationTypes'

const props = defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [string] }>()
const kendt = computed(() => relationGrupper.some(g => g.typer.includes(props.modelValue)))
</script>
