<template>
  <article
    class="bg-white rounded-lg border border-stone-200 shadow-sm p-3 space-y-2 cursor-pointer hover:border-accent/60 transition-colors"
    :class="dragging && 'opacity-40'"
    :draggable="draggable"
    @dragstart="onDragStart"
    @dragend="dragging = false"
    @click="$emit('edit', task)"
  >
    <header class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full shrink-0" :class="priority.dot" :title="`${priority.label} prioritet`" />
      <span
        v-if="project && showProject"
        class="tag !normal-case !tracking-normal truncate max-w-[10rem]"
        :style="{ background: `${project.color}1a`, color: project.color }"
      >{{ project.name }}</span>
      <span
        v-if="assignee"
        class="ml-auto w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white bg-stone-500 shrink-0"
        :title="assignee"
      >{{ assignee.charAt(0).toUpperCase() }}</span>
    </header>
    <h3 class="font-sans text-sm font-semibold text-stone-900 tracking-normal">{{ task.title }}</h3>
    <p v-if="task.description" class="text-xs text-stone-500 line-clamp-2 whitespace-pre-line">{{ task.description }}</p>
    <span v-if="task.deadline" class="tag !normal-case !tracking-normal" :class="deadlineClass(task.deadline)">
      📅 {{ date(task.deadline) }} · {{ deadlineLabel(task.deadline) }}
    </span>
    <ul v-if="task.subtasks.length" class="space-y-1">
      <li v-for="s in task.subtasks" :key="s.id">
        <button type="button" class="flex items-start gap-2 text-xs text-left w-full hover:text-accent" @click.stop="$emit('toggle', s.id)">
          <span class="w-3.5 h-3.5 mt-px rounded border grid place-items-center shrink-0 text-[9px]"
                :class="s.is_completed ? 'bg-accent border-accent text-white' : 'border-stone-300'">{{ s.is_completed ? '✓' : '' }}</span>
          <span :class="s.is_completed && 'line-through text-stone-400'">{{ s.description }}</span>
        </button>
      </li>
    </ul>
    <footer v-if="moveButtons" class="flex items-center gap-1 pt-1" @click.stop>
      <button v-if="prev" type="button" class="btn-icon !w-7 !h-7" :title="`Flyt til ${prev.label}`" :aria-label="`Flyt til ${prev.label}`" @click="$emit('move', prev.id)">←</button>
      <button v-if="task.column_name === 'done'" type="button" class="text-xs text-stone-500 hover:text-accent px-2" @click="$emit('archive')">📥 Arkivér</button>
      <button v-if="next" type="button" class="btn-icon !w-7 !h-7 ml-auto" :title="`Flyt til ${next.label}`" :aria-label="`Flyt til ${next.label}`" @click="$emit('move', next.id)">→</button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { COLUMNS, PRIORITIES, deadlineClass, deadlineLabel, type Column, type Project, type Task } from '../api'
import { useUsersStore } from '../../../stores/users'
import { date } from '../../../lib/format'

const props = withDefaults(defineProps<{
  task: Task
  project?: Project
  showProject?: boolean
  draggable?: boolean
  moveButtons?: boolean
}>(), { showProject: true, draggable: true, moveButtons: true })
defineEmits<{ edit: [Task]; toggle: [number]; move: [Column]; archive: [] }>()

const usersStore = useUsersStore()
const dragging = ref(false)
const priority = computed(() => PRIORITIES.find(p => p.id === props.task.priority)!)
const assignee = computed(() => (props.task.assigned_to != null ? usersStore.byId(props.task.assigned_to)?.username : undefined))
const idx = computed(() => COLUMNS.findIndex(c => c.id === props.task.column_name))
const prev = computed(() => COLUMNS[idx.value - 1])
const next = computed(() => COLUMNS[idx.value + 1])

function onDragStart(e: DragEvent) {
  dragging.value = true
  e.dataTransfer?.setData('text/plain', String(props.task.id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
</script>
