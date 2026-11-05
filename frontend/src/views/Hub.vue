<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-10">
    <section>
      <h1 class="text-3xl font-bold">Velkommen til MateVerse</h1>
      <p class="text-stone-500 mt-1">Ét sted til alle dine mates. Vælg en app for at komme i gang.</p>
    </section>

    <section>
      <h2 class="section-title">Apps</h2>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <li v-for="m in MATES" :key="m.id">
          <component
            :is="m.status === 'ready' ? 'router-link' : 'div'"
            :to="m.status === 'ready' ? `/${m.id}` : undefined"
            class="panel h-full flex flex-col gap-3 transition-all"
            :class="m.status === 'ready' ? 'hover:-translate-y-0.5 hover:shadow-md group' : 'opacity-60'"
            :style="{ '--accent': m.accent, '--accent-soft': m.accentSoft }"
          >
            <div class="flex items-center gap-3">
              <span class="grid place-items-center w-12 h-12 rounded-xl bg-accent-soft text-2xl">{{ m.icon }}</span>
              <div class="min-w-0">
                <div class="font-display text-lg font-bold text-stone-900 group-hover:text-accent">{{ m.name }}</div>
                <span v-if="m.status === 'ready'" class="tag bg-accent-soft text-accent">Klar</span>
                <span v-else class="tag bg-stone-100 text-stone-500">Kommer snart</span>
              </div>
            </div>
            <p class="text-sm text-stone-600 flex-1">{{ m.description }}</p>

            <!-- Lille live-overblik fra maten selv -->
            <div v-if="m.id === 'stockmate'" class="text-sm border-t border-stone-100 pt-3">
              <span v-if="stockSummary === null" class="text-stone-400">Henter …</span>
              <span v-else-if="stockSummary === undefined" class="text-stone-400">Ingen forbindelse til serveren</span>
              <span v-else>
                Samlet værdi <strong class="tabular-nums">{{ money(stockSummary.value) }}</strong>
                <span class="tabular-nums" :class="gainClass(stockSummary.unrealized)">({{ signed(stockSummary.unrealized) }})</span>
              </span>
            </div>
          </component>
        </li>
      </ul>
    </section>

    <section class="max-w-xl">
      <h2 class="section-title">Brugere</h2>
      <div class="panel space-y-4">
        <p class="text-sm text-stone-500">Brugerne er fælles for alle mates.</p>
        <p v-if="usersStore.error" class="text-loss text-sm">{{ usersStore.error }}</p>
        <ul class="flex flex-wrap gap-2">
          <li v-for="u in usersStore.users" :key="u.id" class="tag !text-sm !normal-case !tracking-normal bg-stone-100 text-stone-700">
            {{ u.username }}
          </li>
        </ul>
        <form class="flex gap-2" @submit.prevent="addUser">
          <input v-model="newUser" class="field" placeholder="Nyt brugernavn" maxlength="40">
          <button type="submit" class="btn-secondary shrink-0" :disabled="!newUser.trim() || saving">Tilføj</button>
        </form>
        <p v-if="userError" class="text-loss text-sm">{{ userError }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MATES } from '../mates'
import { useUsersStore } from '../stores/users'
import { stockmateApi } from '../mates/stockmate/api'
import { gainClass, money, signed } from '../lib/format'

const usersStore = useUsersStore()
const newUser = ref('')
const saving = ref(false)
const userError = ref<string | null>(null)
/** null = henter, undefined = fejl */
const stockSummary = ref<{ value: number; unrealized: number } | null | undefined>(null)

onMounted(async () => {
  usersStore.load()
  try {
    const rows = await stockmateApi.overview()
    stockSummary.value = {
      value: rows.reduce((a, r) => a + r.value_dkk, 0),
      unrealized: rows.reduce((a, r) => a + r.unrealized_dkk, 0),
    }
  } catch {
    stockSummary.value = undefined
  }
})

async function addUser() {
  saving.value = true
  userError.value = null
  try {
    await usersStore.create(newUser.value.trim())
    newUser.value = ''
  } catch (e) {
    userError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
