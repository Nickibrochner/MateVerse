<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-stone-500 text-sm">Finder sandsynlige dubletter på navn, email og telefon.</p>
      <button type="button" class="btn-secondary" :disabled="loading" @click="scan">{{ loading ? 'Scanner …' : '🔍 Scan efter dubletter' }}</button>
    </div>
    <p v-if="actionMessage" class="panel text-sm">{{ actionMessage }}</p>

    <section v-if="result?.internal.length">
      <h2 class="section-title">Interne dubletter (samme kontakt)</h2>
      <div class="space-y-2">
        <div v-for="d in result.internal" :key="`${d.contact_id}-${d.type}-${d.vaerdi}`" class="panel flex items-center justify-between gap-3">
          <div class="text-sm">
            <span class="font-semibold">{{ d.visningsnavn }}</span>
            <span class="text-stone-500"> har {{ d.type === 'email' ? 'emailen' : 'telefonnummeret' }} <span class="font-mono">{{ d.vaerdi }}</span> {{ d.ids.length }} gange</span>
          </div>
          <button type="button" class="btn-secondary !text-xs" @click="removeInternal(d)">Slet gentagelser</button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Par-dubletter</h2>
      <p v-if="loading" class="text-stone-500 py-6 text-center">Scanner …</p>
      <p v-else-if="!result?.pairs.length" class="panel text-stone-500">Ingen sandsynlige dubletter fundet.</p>
      <div v-else class="space-y-3">
        <div v-for="(p, i) in result.pairs" :key="i" class="panel space-y-3">
          <div class="flex items-center justify-between">
            <span class="tag" :class="p.score >= 90 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'">{{ p.score }}% · {{ p.reason }}</span>
            <button type="button" class="btn-icon" title="Ignorer dette par" @click="ignore(p)">🚫</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="side in [p.a, p.b]" :key="side.contact.id" class="border border-stone-200 rounded-lg p-3 space-y-1">
              <p class="font-semibold">{{ side.contact.visningsnavn }}</p>
              <p class="text-xs text-stone-500">{{ [side.contact.firma, side.contact.titel].filter(Boolean).join(' · ') || '–' }}</p>
              <p v-for="e in side.emails" :key="e.id" class="text-xs">{{ e.email }}</p>
              <p v-for="t in side.phones" :key="t.id" class="text-xs">{{ t.nummer }}</p>
              <button type="button" class="btn-primary !text-xs !py-1 mt-2" @click="mergeKeeping(p, side.contact.id === p.a.contact.id ? 'a' : 'b')">
                Behold denne
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <button type="button" class="text-sm text-stone-500 hover:text-accent" @click="showIgnored = !showIgnored">
        {{ showIgnored ? '▾' : '▸' }} Ignorerede par ({{ ignored.length }})
      </button>
      <div v-if="showIgnored" class="panel mt-2 space-y-2">
        <p v-if="!ignored.length" class="text-sm text-stone-500">Ingen ignorerede par.</p>
        <div v-for="pair in ignored" :key="`${pair.id_a}-${pair.id_b}`" class="flex items-center justify-between text-sm">
          <span>{{ pair.navn_a ?? 'Slettet kontakt' }} ↔ {{ pair.navn_b ?? 'Slettet kontakt' }}</span>
          <button type="button" class="btn-secondary !text-xs" @click="reactivate(pair)">Genaktiver</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { contactmateApi, type DuplicatePair, type DuplicateResult, type IgnoredPair, type InternalDuplicate } from '../api'

const result = ref<DuplicateResult | null>(null)
const loading = ref(false)
const ignored = ref<IgnoredPair[]>([])
const showIgnored = ref(false)
const actionMessage = ref('')

async function scan() {
  actionMessage.value = ''
  await load()
}

async function load() {
  loading.value = true
  try {
    result.value = await contactmateApi.duplicates()
    ignored.value = await contactmateApi.ignoredPairs()
  } finally {
    loading.value = false
  }
}

async function mergeKeeping(pair: DuplicatePair, side: 'a' | 'b') {
  const keep = side === 'a' ? pair.a : pair.b
  const other = side === 'a' ? pair.b : pair.a
  await contactmateApi.mergeDuplicates({
    keep_id: keep.contact.id, delete_id: other.contact.id,
    fornavn: keep.contact.fornavn, efternavn: keep.contact.efternavn,
    firma: keep.contact.firma, titel: keep.contact.titel, noter: keep.contact.noter,
  })
  actionMessage.value = `${other.contact.visningsnavn} blev lagt sammen med ${keep.contact.visningsnavn}.`
  await load()
}

async function ignore(pair: DuplicatePair) {
  await contactmateApi.ignoreDuplicate(pair.a.contact.id, pair.b.contact.id)
  await load()
}

async function reactivate(pair: IgnoredPair) {
  await contactmateApi.unignoreDuplicate(pair.id_a, pair.id_b)
  await load()
}

async function removeInternal(d: InternalDuplicate) {
  await contactmateApi.removeInternalDuplicates(d.ids, d.ids[0])
  actionMessage.value = `Gentagelser af ${d.vaerdi} fjernet.`
  await load()
}

onMounted(load)
</script>
