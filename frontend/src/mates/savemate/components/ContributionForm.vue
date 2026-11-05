<template>
  <form class="space-y-4" @submit.prevent="save">
    <div v-if="goalId != null" class="grid grid-cols-3 gap-2">
      <button
        v-for="k in KINDS"
        :key="k.id"
        type="button"
        class="btn border !px-2"
        :class="kind === k.id ? 'bg-accent text-white border-accent' : 'bg-white border-stone-300 text-stone-600'"
        @click="kind = k.id"
      >{{ k.label }}</button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label">Beløb (DKK)</label>
        <input v-model.number="amount" type="number" min="0.01" step="any" class="field" required>
      </div>
      <div>
        <label class="label">Dato</label>
        <input v-model="form.contribution_date" type="date" class="field" required>
      </div>
    </div>
    <div>
      <label class="label">Beskrivelse</label>
      <input v-model="form.description" class="field" placeholder="Valgfri">
    </div>
    <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn-secondary" @click="$emit('cancel')">Annuller</button>
      <button type="submit" class="btn-primary" :disabled="saving">Gem</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { saveApi, type Contribution, type ContributionInput } from '../api'
import { today } from '../../../lib/format'

type Kind = 'monthly' | 'lump' | 'withdraw'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'monthly', label: 'Fast opsparing' },
  { id: 'lump', label: 'Engangsbeløb' },
  { id: 'withdraw', label: 'Hævning' },
]

/** goalId null = generelt engangsbeløb, der ikke hører til et bestemt mål. */
const props = defineProps<{ goalId: number | null; contribution: Contribution | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const c = props.contribution
const kind = ref<Kind>(c ? (c.amount < 0 ? 'withdraw' : c.is_lump_sum ? 'lump' : 'monthly') : props.goalId == null ? 'lump' : 'monthly')
const amount = ref(c ? Math.abs(c.amount) : 0)
const form = reactive({ contribution_date: c?.contribution_date ?? today(), description: c?.description ?? '' })
const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  const body: ContributionInput = {
    goal_id: props.goalId,
    amount: kind.value === 'withdraw' ? -amount.value : amount.value,
    contribution_date: form.contribution_date,
    description: form.description,
    is_lump_sum: props.goalId == null || kind.value !== 'monthly',
  }
  try {
    if (c) await saveApi.updateContribution(c.id, body)
    else await saveApi.createContribution(body)
    emit('saved')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
