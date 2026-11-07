<template>
  <div class="max-w-2xl mx-auto px-4 py-10 space-y-6">
    <h1 class="text-2xl font-bold">Indstillinger</h1>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">Layout</h2>
      <p class="text-sm text-stone-500">
        Vælg hvordan du navigerer i MateVerse. Gælder kun denne browser, ligesom rækkefølgen af kortene i hubben.
      </p>
      <div class="flex gap-2">
        <button
          type="button" class="btn-secondary"
          :class="layout === 'topbar' && '!border-accent !text-accent'"
          @click="layout = 'topbar'"
        >
          ▭ Topbar
        </button>
        <button
          type="button" class="btn-secondary"
          :class="layout === 'sidebar' && '!border-accent !text-accent'"
          @click="layout = 'sidebar'"
        >
          ▥ Sidebar
        </button>
      </div>
      <p class="text-xs text-stone-400">
        Topbar er den oprindelige stil med en bjælke foroven. Sidebar holder navigationen fast i venstre side, som i Domus.
      </p>
    </section>

    <section class="panel space-y-3">
      <h2 class="section-title !mb-0">Kort-info</h2>
      <p class="text-sm text-stone-500">
        Vælg hvilket nøgletal hvert kort i hubben viser. Gælder kun denne browser.
      </p>
      <div class="space-y-2">
        <div v-for="(options, mateId) in HUB_INFO_OPTIONS" :key="mateId" class="flex items-center justify-between gap-4">
          <span class="font-medium text-stone-700">{{ findMate(mateId)?.name ?? mateId }}</span>
          <select
            class="field !w-auto"
            :value="cardInfoSelection[mateId] ?? 'none'"
            @change="setCardInfo(mateId, ($event.target as HTMLSelectElement).value)"
          >
            <option value="none">Ingen</option>
            <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { layout } from '../lib/settings'
import { HUB_INFO_OPTIONS } from '../lib/hubCardInfo'
import { cardInfoSelection, setCardInfo } from '../lib/hubCardSettings'
import { findMate } from '../mates'
</script>
