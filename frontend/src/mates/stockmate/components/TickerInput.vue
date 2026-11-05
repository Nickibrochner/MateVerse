<template>
  <div ref="root" class="relative">
    <input
      :value="modelValue"
      class="field uppercase"
      placeholder="Fx NOVO-B.CO eller AAPL"
      autocomplete="off"
      required
      @input="onInput(($event.target as HTMLInputElement).value)"
      @focus="open = true"
      @keydown.escape="open = false"
      @blur="onBlur"
    >
    <ul v-if="open && suggestions.length" class="panel !p-1 absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-y-auto">
      <li v-for="s in suggestions" :key="s.symbol">
        <button
          type="button"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 flex items-baseline gap-2"
          @mousedown.prevent="pick(s.symbol)"
        >
          <span class="font-semibold">{{ s.symbol }}</span>
          <span class="text-sm text-stone-500 truncate">{{ s.name }}</span>
          <span class="ml-auto text-xs text-stone-400 shrink-0">{{ s.exchange }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { stockmateApi, type SearchResult } from '../api'

const props = defineProps<{ modelValue: string; known: { ticker: string; name: string | null }[] }>()
const emit = defineEmits<{ 'update:modelValue': [string]; picked: [string] }>()

const open = ref(false)
const remote = ref<SearchResult[]>([])
let timer: ReturnType<typeof setTimeout> | undefined

/** Kendte aktier først, derefter Yahoos søgeresultater. */
const suggestions = computed<SearchResult[]>(() => {
  const q = props.modelValue.trim().toUpperCase()
  const local = props.known
    .filter(k => !q || k.ticker.includes(q) || k.name?.toUpperCase().includes(q))
    .map(k => ({ symbol: k.ticker, name: k.name, exchange: 'Kendt' }))
  const seen = new Set(local.map(l => l.symbol))
  return [...local, ...remote.value.filter(r => !seen.has(r.symbol))].slice(0, 10)
})

function onInput(value: string) {
  emit('update:modelValue', value.toUpperCase())
  open.value = true
  clearTimeout(timer)
  if (value.trim().length < 2) {
    remote.value = []
    return
  }
  timer = setTimeout(async () => {
    remote.value = await stockmateApi.search(value.trim()).catch(() => [])
  }, 300)
}

function pick(symbol: string) {
  emit('update:modelValue', symbol)
  emit('picked', symbol)
  open.value = false
}

function onBlur() {
  open.value = false
  if (props.modelValue.trim()) emit('picked', props.modelValue.trim())
}
</script>
