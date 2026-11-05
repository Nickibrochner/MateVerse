<template>
  <div class="relative">
    <input
      v-model="søg"
      class="field pr-8"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="åben = true"
      @blur="åben = false"
      @input="onInput"
    >
    <button v-if="søg" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs" aria-label="Ryd" @mousedown.prevent="vælg(null)">✕</button>
    <ul v-if="åben && forslag.length" class="panel !p-1 absolute left-0 right-0 top-full mt-1 z-40 max-h-60 overflow-y-auto">
      <li v-for="p in forslag" :key="p.id">
        <button type="button" class="w-full text-left px-3 py-1.5 rounded-lg hover:bg-stone-100 text-sm" @mousedown.prevent="vælg(p)">
          {{ p.navn }}
          <span v-if="p.fødselsdato" class="text-stone-400 text-xs ml-1">f. {{ p.fødselsdato.slice(0, 4) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Person } from '../api'
import { useKinStore } from '../store'

/** Søg og vælg en person. v-model er personens id ('' = ingen). */
const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string }>(), { placeholder: 'Søg navn …' })
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const store = useKinStore()

const søg = ref('')
const åben = ref(false)
watch(() => props.modelValue, id => {
  søg.value = store.persons.find(p => p.id === id)?.navn ?? ''
}, { immediate: true })

const forslag = computed(() => {
  const q = søg.value.trim().toLowerCase()
  if (!q) return []
  return store.persons.filter(p => p.navn.toLowerCase().includes(q)).slice(0, 8)
})

function onInput() {
  åben.value = true
  if (props.modelValue) emit('update:modelValue', '')
}

function vælg(p: Person | null) {
  søg.value = p?.navn ?? ''
  åben.value = false
  emit('update:modelValue', p?.id ?? '')
}
</script>
