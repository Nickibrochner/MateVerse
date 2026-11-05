<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label">Navn</label>
      <input v-model="form.name" class="field" placeholder="Fx Husholdning 2026 eller Sommerhus" required>
    </div>
    <div>
      <label class="label">Type</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="opt in TYPES"
          :key="opt.id"
          type="button"
          class="btn border flex-col !items-start !gap-0 text-left"
          :class="form.event_type === opt.id ? 'bg-accent-soft border-accent text-accent' : 'bg-white border-stone-300 text-stone-600'"
          @click="form.event_type = opt.id"
        >
          <span>{{ opt.label }}</span>
          <span class="text-xs font-normal opacity-80">{{ opt.hint }}</span>
        </button>
      </div>
    </div>
    <template v-if="form.event_type === 'project'">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">Startdato</label>
          <input v-model="form.start_date" type="date" class="field">
        </div>
        <div>
          <label class="label">Slutdato</label>
          <input v-model="form.end_date" type="date" class="field">
        </div>
      </div>
      <div>
        <label class="label">Budget (valgfrit)</label>
        <input v-model.number="form.budget_amount" type="number" min="0" step="any" class="field">
      </div>
    </template>
    <div>
      <label class="label">Deltagere</label>
      <MemberPicker v-model="form.member_ids" />
    </div>
    <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn-secondary" @click="$emit('cancel')">Annuller</button>
      <button type="submit" class="btn-primary" :disabled="saving || !form.member_ids.length">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import MemberPicker from '../../../components/MemberPicker.vue'
import { econApi, type EconEvent, type EventInput, type EventType } from '../api'
import { useUsersStore } from '../../../stores/users'

const TYPES: { id: EventType; label: string; hint: string }[] = [
  { id: 'budget', label: 'Budget', hint: 'Faste udgifter pr. måned' },
  { id: 'project', label: 'Projekt', hint: 'Udlæg der skal udlignes' },
]

const props = defineProps<{ initial: EconEvent | null }>()
const emit = defineEmits<{ saved: [EconEvent]; cancel: [] }>()
const usersStore = useUsersStore()

const form = reactive<EventInput>({
  name: props.initial?.name ?? '',
  event_type: props.initial?.event_type ?? 'budget',
  start_date: props.initial?.start_date ?? null,
  end_date: props.initial?.end_date ?? null,
  budget_amount: props.initial?.budget_amount ?? 0,
  member_ids: props.initial?.member_ids ?? usersStore.users.map(u => u.id),
})
// Nye begivenheder får alle brugere som deltagere, også hvis brugerne indlæses lidt senere
watch(() => usersStore.users, users => {
  if (!props.initial && !form.member_ids.length) form.member_ids = users.map(u => u.id)
}, { immediate: true })

const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    const body = { ...form, budget_amount: form.budget_amount || 0 }
    emit('saved', props.initial ? await econApi.updateEvent(props.initial.id, body) : await econApi.createEvent(body))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
