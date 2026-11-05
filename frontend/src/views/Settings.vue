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
  </div>
</template>

<script setup lang="ts">
import { layout } from '../lib/settings'
</script>
