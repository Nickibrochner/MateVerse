<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label">Titel</label>
      <input ref="titleInput" v-model="form.title" class="field" placeholder="Fx Køb maling" required>
    </div>
    <div>
      <label class="label">Beskrivelse</label>
      <textarea v-model="form.description" rows="3" class="field resize-y" placeholder="Valgfri" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label">Kolonne</label>
        <select v-model="form.column_name" class="field">
          <option v-for="c in COLUMNS" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">Prioritet</label>
        <select v-model="form.priority" class="field">
          <option v-for="p in PRIORITIES" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </div>
      <div>
        <label class="label">Deadline</label>
        <input v-model="form.deadline" type="date" class="field">
      </div>
      <div>
        <label class="label">Tildelt</label>
        <select v-model="form.assigned_to" class="field">
          <option :value="null">Ingen</option>
          <option v-for="u in usersStore.users" :key="u.id" :value="u.id">{{ u.username }}</option>
        </select>
      </div>
      <div class="col-span-2">
        <label class="label">Projekt</label>
        <select v-model="form.project_id" class="field">
          <option :value="null">Intet projekt</option>
          <option v-for="p in projects.filter(p => !p.is_archived || p.id === form.project_id)" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
    </div>
    <div>
      <label class="label">Underopgaver</label>
      <ul class="space-y-2">
        <li v-for="(s, i) in form.subtasks" :key="i" class="flex items-center gap-2">
          <input v-model="s.is_completed" type="checkbox" class="w-4 h-4" :aria-label="`Færdig: ${s.description}`">
          <input v-model="s.description" class="field !py-1.5" placeholder="Underopgave">
          <button type="button" class="btn-icon" aria-label="Fjern underopgave" @click="form.subtasks.splice(i, 1)">✕</button>
        </li>
      </ul>
      <button type="button" class="text-sm text-accent font-semibold mt-2 hover:underline" @click="form.subtasks.push({ description: '', is_completed: false })">
        + Tilføj underopgave
      </button>
    </div>
    <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    <div class="flex items-center gap-2 pt-2">
      <ConfirmButton v-if="task" label="Læg i papirkurven" @confirm="remove" />
      <button type="button" class="btn-secondary ml-auto" @click="$emit('close')">Annuller</button>
      <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import { COLUMNS, PRIORITIES, kanApi, type Column, type Project, type Task, type TaskInput } from '../api'
import { useUsersStore } from '../../../stores/users'

const props = defineProps<{ task: Task | null; projects: Project[]; defaults?: { column_name?: Column; project_id?: number | null } }>()
const emit = defineEmits<{ saved: []; close: [] }>()
const usersStore = useUsersStore()
const titleInput = ref<HTMLInputElement | null>(null)

const form = reactive<TaskInput>({
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  column_name: props.task?.column_name ?? props.defaults?.column_name ?? 'todo',
  project_id: props.task?.project_id ?? props.defaults?.project_id ?? null,
  deadline: props.task?.deadline ?? null,
  priority: props.task?.priority ?? 'medium',
  assigned_to: props.task?.assigned_to ?? null,
  subtasks: props.task?.subtasks.map(s => ({ description: s.description, is_completed: s.is_completed })) ?? [],
})
const saving = ref(false)
const error = ref<string | null>(null)

onMounted(() => titleInput.value?.focus())

async function save() {
  saving.value = true
  error.value = null
  try {
    const body = { ...form, deadline: form.deadline || null }
    if (props.task) await kanApi.updateTask(props.task.id, body)
    else await kanApi.createTask(body)
    emit('saved')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  await kanApi.deleteTask(props.task!.id)
  emit('saved')
}
</script>
