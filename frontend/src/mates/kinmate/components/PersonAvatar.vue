<template>
  <div class="relative shrink-0 group/avatar" :style="{ width: `${size}px`, height: `${size}px` }">
    <img
      :src="billedeUrl(person) ?? placeholderSvg(person.køn)"
      alt=""
      class="w-full h-full rounded-full object-cover border border-stone-200"
      :class="!person.billede && 'bg-stone-50'"
    >
    <template v-if="editable">
      <button
        type="button"
        class="absolute inset-0 rounded-full grid place-items-center bg-stone-900/50 text-white opacity-0 group-hover/avatar:opacity-100 focus:opacity-100 transition-opacity"
        :aria-label="`Vælg billede af ${person.navn}`"
        @click="input?.click()"
      >📷</button>
      <button
        v-if="person.billede"
        type="button"
        class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-stone-300 text-[10px] text-stone-500 hover:text-loss opacity-0 group-hover/avatar:opacity-100 focus:opacity-100"
        :aria-label="`Fjern billede af ${person.navn}`"
        @click="fjern"
      >✕</button>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" @change="vælg">
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { billedeUrl, kinApi, type Person } from '../api'
import { læsSomDataUrl, placeholderSvg } from '../lib'
import { useKinStore } from '../store'

const props = withDefaults(defineProps<{ person: Person; size?: number; editable?: boolean }>(), { size: 48, editable: false })
const store = useKinStore()
const input = ref<HTMLInputElement | null>(null)

async function vælg(e: Event) {
  const fil = (e.target as HTMLInputElement).files?.[0]
  if (!fil) return
  try {
    await kinApi.setBillede(props.person.id, await læsSomDataUrl(fil))
    await store.loadAll()
  } catch (err) {
    alert(`Fejl ved billedupload: ${(err as Error).message}`)
  } finally {
    if (input.value) input.value.value = ''
  }
}

async function fjern() {
  if (!confirm('Fjern billedet fra denne person?')) return
  await kinApi.setBillede(props.person.id, null)
  await store.loadAll()
}
</script>
