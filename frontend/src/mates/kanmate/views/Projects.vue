<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">KanMate</h1>
        <p class="text-stone-500 mt-1">Familiens projekter og opgaver.</p>
      </div>
      <button type="button" class="btn-primary" @click="openProject(null)">+ Nyt projekt</button>
    </div>
    <KanNav />

    <p v-if="error" class="panel text-loss">{{ error }}</p>
    <p v-else-if="!projects" class="text-stone-400">Henter …</p>
    <template v-else>
      <p v-if="!active.length" class="text-stone-500">Ingen projekter endnu. Opret det første, eller brug boardet til løse opgaver.</p>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <li v-for="p in active" :key="p.id">
          <ProjectCard :project="p" @edit="openProject(p)" />
        </li>
      </ul>

      <section v-if="archived.length">
        <button type="button" class="section-title hover:text-accent" @click="showArchived = !showArchived">
          {{ showArchived ? '▾' : '▸' }} Arkiverede projekter ({{ archived.length }})
        </button>
        <ul v-if="showArchived" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
          <li v-for="p in archived" :key="p.id">
            <ProjectCard :project="p" @edit="openProject(p)" />
          </li>
        </ul>
      </section>
    </template>

    <Modal :open="projectOpen" :title="editing ? 'Rediger projekt' : 'Nyt projekt'" @close="projectOpen = false">
      <form class="space-y-4" @submit.prevent="saveProject">
        <div>
          <label class="label">Navn</label>
          <input v-model="pForm.name" class="field" required placeholder="Fx Renovering af badeværelse">
        </div>
        <div>
          <label class="label">Farve</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in PROJECT_COLORS"
              :key="c"
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-transform"
              :class="pForm.color === c ? 'border-stone-900 scale-110' : 'border-transparent'"
              :style="{ background: c }"
              :aria-label="`Farve ${c}`"
              @click="pForm.color = c"
            />
          </div>
        </div>
        <label v-if="editing" class="flex items-center gap-2 text-sm">
          <input v-model="pForm.is_archived" type="checkbox" class="w-4 h-4"> Arkivér projektet
        </label>
        <p v-if="pError" class="text-loss text-sm">{{ pError }}</p>
        <div class="flex items-center gap-2">
          <ConfirmButton v-if="editing" label="Læg projektet i papirkurven" @confirm="removeProject" />
          <button type="button" class="btn-secondary ml-auto" @click="projectOpen = false">Annuller</button>
          <button type="submit" class="btn-primary">Gem</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import KanNav from '../components/KanNav.vue'
import { COLUMNS, PROJECT_COLORS, kanApi, type Project, type ProjectInput } from '../api'

const projects = ref<Project[] | null>(null)
const error = ref<string | null>(null)
const showArchived = ref(false)
const active = computed(() => projects.value?.filter(p => !p.is_archived) ?? [])
const archived = computed(() => projects.value?.filter(p => p.is_archived) ?? [])

async function load() {
  try {
    projects.value = await kanApi.projects()
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)

const projectOpen = ref(false)
const editing = ref<Project | null>(null)
const pError = ref<string | null>(null)
const pForm = reactive<ProjectInput>({ name: '', color: PROJECT_COLORS[0], is_archived: false })

function openProject(p: Project | null) {
  editing.value = p
  Object.assign(pForm, p ? { name: p.name, color: p.color, is_archived: p.is_archived } : { name: '', color: PROJECT_COLORS[0], is_archived: false })
  pError.value = null
  projectOpen.value = true
}
async function saveProject() {
  try {
    if (editing.value) await kanApi.updateProject(editing.value.id, { ...pForm })
    else await kanApi.createProject({ ...pForm })
    projectOpen.value = false
    await load()
  } catch (e) {
    pError.value = (e as Error).message
  }
}
async function removeProject() {
  await kanApi.deleteProject(editing.value!.id)
  projectOpen.value = false
  await load()
}

/** Projektkort med fremdrift – defineret her, da det kun bruges på denne side. */
const ProjectCard = defineComponent({
  props: { project: { type: Object as PropType<Project>, required: true } },
  emits: ['edit'],
  setup(props, { emit }) {
    return () => {
      const p = props.project
      const counts = p.counts ?? { todo: 0, doing: 0, done: 0 }
      const total = counts.todo + counts.doing + counts.done
      return h('div', { class: 'panel h-full flex flex-col gap-3 relative', style: { borderTop: `4px solid ${p.color}` } }, [
        h('div', { class: 'flex items-start justify-between gap-2' }, [
          h(RouterLink, { to: `/kanmate/projekt/${p.id}`, class: 'font-display text-lg font-bold hover:text-accent' }, () => p.name),
          h('button', { type: 'button', class: 'btn-icon', title: 'Rediger projekt', 'aria-label': 'Rediger projekt', onClick: () => emit('edit') }, '✎'),
        ]),
        h('div', { class: 'flex gap-3 text-xs text-stone-500' },
          COLUMNS.map(c => h('span', `${c.label}: ${counts[c.id]}`))),
        h('div', { class: 'h-2 rounded-full bg-stone-100 overflow-hidden mt-auto' }, [
          h('div', { class: 'h-full rounded-full', style: { width: `${total ? (counts.done / total) * 100 : 0}%`, background: p.color } }),
        ]),
      ])
    }
  },
})
</script>
