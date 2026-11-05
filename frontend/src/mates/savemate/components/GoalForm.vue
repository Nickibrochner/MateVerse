<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label">Ikon</label>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="i in ICONS"
          :key="i"
          type="button"
          class="w-9 h-9 rounded-lg text-lg border transition-colors"
          :class="form.icon === i ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-stone-100'"
          @click="form.icon = i"
        >{{ i }}</button>
      </div>
    </div>
    <div>
      <label class="label">Navn</label>
      <input v-model="form.name" class="field" required placeholder="Fx Sommerferie 2027">
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label">Målbeløb (DKK)</label>
        <input v-model.number="form.target_amount" type="number" min="1" step="any" class="field" required>
      </div>
      <div>
        <label class="label">Måldato</label>
        <input v-model="form.target_date" type="date" class="field" required>
      </div>
    </div>
    <div>
      <label class="label">Hvis mål</label>
      <select v-model="form.owner_id" class="field">
        <option :value="null">Fælles</option>
        <option v-for="u in usersStore.users" :key="u.id" :value="u.id">{{ u.username }}</option>
      </select>
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
import { ICONS, saveApi, type Goal, type GoalInput } from '../api'
import { useUsersStore } from '../../../stores/users'

const props = defineProps<{ goal: Goal | null }>()
const emit = defineEmits<{ saved: [Goal]; cancel: [] }>()
const usersStore = useUsersStore()

const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
const form = reactive<GoalInput>({
  name: props.goal?.name ?? '',
  target_amount: props.goal?.target_amount ?? 10_000,
  target_date: props.goal?.target_date ?? nextYear,
  owner_id: props.goal?.owner_id ?? null,
  icon: props.goal?.icon ?? '🎯',
})
const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    emit('saved', props.goal ? await saveApi.updateGoal(props.goal.id, { ...form }) : await saveApi.createGoal({ ...form }))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
