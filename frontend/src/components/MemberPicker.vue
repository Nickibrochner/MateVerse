<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="u in usersStore.users"
      :key="u.id"
      type="button"
      class="tag !text-sm !normal-case !tracking-normal border transition-colors"
      :class="modelValue.includes(u.id) ? 'bg-accent text-white border-accent' : 'bg-white border-stone-300 text-stone-600 hover:border-accent'"
      :aria-pressed="modelValue.includes(u.id)"
      @click="toggle(u.id)"
    >{{ u.username }}</button>
  </div>
</template>

<script setup lang="ts">
import { useUsersStore } from '../stores/users'

/** Vælg hubbrugere – bruges af mates, der har deltagere (fx Econmate). */
const props = defineProps<{ modelValue: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [number[]] }>()
const usersStore = useUsersStore()
usersStore.load()

const toggle = (id: number) =>
  emit('update:modelValue', props.modelValue.includes(id) ? props.modelValue.filter(x => x !== id) : [...props.modelValue, id])
</script>
