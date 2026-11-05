<template>
  <span class="inline-block px-2 py-0.5 mx-0.5 rounded-full text-[13px] font-medium" :class="FARVER[gruppeFor(type)] ?? 'bg-stone-100 text-stone-600'">{{ type }}</span>
</template>

<script setup lang="ts">
import { gruppeFor } from '../relationTypes'

defineProps<{ type: string }>()
const FARVER: Record<string, string> = {
  'Forældre': 'bg-blue-100 text-blue-900',
  'Barn': 'bg-green-100 text-green-900',
  'Partner': 'bg-pink-100 text-pink-900',
  'Søskende': 'bg-amber-100 text-amber-900',
  'Svigerforældre': 'bg-indigo-100 text-indigo-900',
  'Svigerbarn': 'bg-purple-100 text-purple-900',
  'Svoger/svigerinde': 'bg-orange-100 text-orange-900',
  'Onkel/tante': 'bg-emerald-100 text-emerald-900',
  'Nevø/niece': 'bg-cyan-100 text-cyan-900',
  'Bedsteforældre': 'bg-violet-100 text-violet-900',
  'Barnebarn': 'bg-fuchsia-100 text-fuchsia-900',
}
</script>
