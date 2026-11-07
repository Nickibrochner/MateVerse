<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-10">
    <section>
      <h1 class="text-3xl font-bold">Velkommen til MateVerse</h1>
      <p class="text-stone-500 mt-1">Ét sted til alle dine mates. Vælg en app for at komme i gang.</p>
    </section>

    <section>
      <div class="flex items-center gap-2">
        <h2 class="section-title !mb-0">Apps</h2>
        <span class="text-xs text-stone-400">Træk et kort for at ændre rækkefølgen</span>
      </div>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
        <li
          v-for="(m, i) in orderedMates" :key="m.id"
          draggable="true"
          @dragstart="onDragStart(i)"
          @dragover.prevent
          @dragenter.prevent="dragOver = i"
          @drop="onDrop(i)"
          @dragend="dragFrom = null; dragOver = null"
          :class="{ 'opacity-40': dragFrom === i, 'ring-2 ring-accent rounded-xl': dragOver === i && dragFrom !== i }"
        >
          <component
            :is="m.href ? 'a' : m.status === 'ready' ? 'router-link' : 'div'"
            :href="m.href"
            :target="m.href ? '_blank' : undefined"
            :rel="m.href ? 'noopener' : undefined"
            :to="!m.href && m.status === 'ready' ? `/${m.id}` : undefined"
            class="panel h-full flex flex-col gap-3 transition-all cursor-grab active:cursor-grabbing"
            :class="m.status === 'ready' ? 'hover:-translate-y-0.5 hover:shadow-md group' : 'opacity-60'"
            :style="{ '--accent': m.accent, '--accent-soft': m.accentSoft }"
          >
            <div class="flex items-center gap-3">
              <span class="grid place-items-center w-12 h-12 rounded-xl bg-accent-soft text-2xl">{{ m.icon }}</span>
              <div class="min-w-0">
                <div class="font-display text-lg font-bold text-stone-900 group-hover:text-accent">{{ m.name }}</div>
                <span v-if="m.href" class="tag bg-accent-soft text-accent">Åbner i nyt vindue</span>
                <span v-else-if="m.status !== 'ready'" class="tag bg-stone-100 text-stone-500">Kommer snart</span>
              </div>
            </div>
            <p class="text-sm text-stone-600 flex-1">{{ m.description }}</p>

            <!-- Lille live-overblik fra maten selv – hvilket tal vælges under Indstillinger → Kort-info -->
            <div
              v-if="activeCardInfoOption(m.id) && cardInfo[m.id]?.status !== 'empty'"
              class="text-sm border-t border-stone-100 pt-3"
            >
              <span v-if="!cardInfo[m.id] || cardInfo[m.id].status === 'loading'" class="text-stone-400">Henter …</span>
              <span v-else-if="cardInfo[m.id].status === 'error'" class="text-stone-400">Ingen forbindelse til serveren</span>
              <span v-else class="tabular-nums">{{ cardInfo[m.id].text }}</span>
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
import { onMounted, reactive, ref } from 'vue'
import { useUsersStore } from '../stores/users'
import { MATES } from '../mates'
import { orderedMates, reorderMates } from '../lib/mateOrder'
import { activeCardInfoOption } from '../lib/hubCardSettings'

const usersStore = useUsersStore()
const newUser = ref('')
const saving = ref(false)
const userError = ref<string | null>(null)

interface CardInfoState { status: 'loading' | 'error' | 'empty' | 'ok'; text?: string }
const cardInfo = reactive<Record<string, CardInfoState>>({})

async function loadCardInfo(mateId: string) {
  const option = activeCardInfoOption(mateId)
  if (!option) return
  cardInfo[mateId] = { status: 'loading' }
  try {
    const text = await option.fetch()
    cardInfo[mateId] = text ? { status: 'ok', text } : { status: 'empty' }
  } catch {
    cardInfo[mateId] = { status: 'error' }
  }
}

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)
function onDragStart(i: number) {
  dragFrom.value = i
}
function onDrop(i: number) {
  if (dragFrom.value === null || dragFrom.value === i) return
  const ids = orderedMates.value.map(m => m.id)
  const [moved] = ids.splice(dragFrom.value, 1)
  ids.splice(i, 0, moved)
  reorderMates(ids)
  dragFrom.value = null
  dragOver.value = null
}

onMounted(() => {
  usersStore.load()
  for (const m of MATES) loadCardInfo(m.id)
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
