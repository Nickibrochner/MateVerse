<template>
  <Modal :open="true" :title="detail?.titel ?? 'Opskrift'" wide @close="$emit('close')">
    <p v-if="loading" class="text-stone-500 py-6 text-center">Henter …</p>
    <div v-else-if="detail" class="space-y-5">
      <div v-if="!editing" class="space-y-4">
        <div class="flex flex-wrap items-center gap-2 text-sm text-stone-500">
          <span v-if="detail.tilberedningstid">⏱ {{ detail.tilberedningstid }} min</span>
          <span v-for="t in tagListe" :key="t" class="tag bg-stone-100 text-stone-600">{{ t }}</span>
        </div>
        <p v-if="detail.beskrivelse" class="text-sm whitespace-pre-wrap">{{ detail.beskrivelse }}</p>

        <div class="flex items-center gap-2">
          <label class="label !mb-0">Portioner</label>
          <button type="button" class="btn-icon" @click="justerPortioner(-1)">−</button>
          <span class="w-8 text-center tabular-nums">{{ oenskedePortioner }}</span>
          <button type="button" class="btn-icon" @click="justerPortioner(1)">+</button>
          <button v-if="oenskedePortioner !== detail.portioner" type="button" class="text-xs text-accent ml-1" @click="oenskedePortioner = detail.portioner">
            nulstil til {{ detail.portioner }}
          </button>
        </div>

        <div class="panel !p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div v-for="(label, key) in NUTRIENT_LABELS" :key="key">
            <div class="text-xs text-stone-400">{{ label }}</div>
            <div class="font-semibold">{{ skaleretPrPortion[key] ?? '–' }}</div>
          </div>
        </div>

        <div>
          <h3 class="font-semibold mb-1">Ingredienser <span class="text-xs text-stone-400 font-normal">({{ skaleringsfaktor === 1 ? 'original mængde' : `skaleret til ${oenskedePortioner} portioner` }})</span></h3>
          <ul class="text-sm space-y-1">
            <li v-for="l in detail.ingredienser" :key="l.ingredient_id" class="flex justify-between">
              <span>{{ l.navn }}</span>
              <span class="text-stone-500">{{ formatGram(l.maengde * skaleringsfaktor) }} g <span v-if="l.naering.energi_kcal != null" class="text-stone-400">· {{ Math.round(l.naering.energi_kcal * l.maengde * skaleringsfaktor / 100) }} kcal</span></span>
            </li>
          </ul>
        </div>

        <div v-if="detail.trin.length">
          <h3 class="font-semibold mb-1">Fremgangsmåde</h3>
          <ol class="text-sm space-y-1.5 list-decimal list-inside">
            <li v-for="t in detail.trin" :key="t.id">{{ t.tekst }}</li>
          </ol>
        </div>

        <div class="flex justify-between pt-2">
          <button type="button" class="btn-secondary !text-loss" @click="confirmDelete">Slet opskrift</button>
          <button type="button" class="btn-primary" @click="startEdit">Redigér</button>
        </div>
      </div>

      <form v-else class="space-y-4" @submit.prevent="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2"><label class="label">Titel</label><input v-model="form.titel" class="field" required></div>
          <div><label class="label">Tilberedningstid (min)</label><input v-model.number="form.tilberedningstid" type="number" min="0" class="field"></div>
          <div><label class="label">Portioner</label><input v-model.number="form.portioner" type="number" min="1" class="field" required></div>
          <div class="sm:col-span-2"><label class="label">Tags (kommasepareret)</label><input v-model="form.tags" class="field" placeholder="aftensmad, vegetar"></div>
        </div>
        <div><label class="label">Beskrivelse</label><textarea v-model="form.beskrivelse" class="field" rows="2"></textarea></div>

        <div>
          <h3 class="font-semibold mb-1">Ingredienser</h3>
          <ul class="text-sm space-y-1 mb-2">
            <li v-for="l in detail.ingredienser" :key="l.ingredient_id" class="flex items-center gap-2">
              <span class="flex-1">{{ l.navn }}</span>
              <input
                type="number" min="1" class="field !w-24 !py-1" :value="l.maengde"
                @change="opdaterMaengde(l.ingredient_id, ($event.target as HTMLInputElement).valueAsNumber)"
              >
              <span class="text-xs text-stone-400">g</span>
              <button type="button" class="btn-icon" @click="fjernIngrediens(l.ingredient_id)">✕</button>
            </li>
          </ul>
          <div class="flex gap-2">
            <select v-model.number="nyIngrediensId" class="field">
              <option :value="null">Vælg ingrediens …</option>
              <option v-for="i in valgbareIngredienser" :key="i.id" :value="i.id">{{ i.navn }}</option>
            </select>
            <input v-model.number="nyMaengde" type="number" min="1" class="field !w-24" placeholder="g">
            <button type="button" class="btn-secondary shrink-0" :disabled="!nyIngrediensId || !nyMaengde" @click="tilfoejIngrediens">Tilføj</button>
          </div>
        </div>

        <div>
          <h3 class="font-semibold mb-1">Fremgangsmåde</h3>
          <div v-for="(trin, i) in trinKladde" :key="i" class="flex gap-2 mb-1.5">
            <span class="text-xs text-stone-400 pt-2 w-4">{{ i + 1 }}.</span>
            <textarea v-model="trinKladde[i]" class="field flex-1" rows="1" @blur="gemTrin"></textarea>
            <button type="button" class="btn-icon shrink-0" @click="fjernTrin(i)">✕</button>
          </div>
          <button type="button" class="btn-secondary !text-xs" @click="tilfoejTrin">+ Tilføj trin</button>
        </div>

        <div class="flex justify-between pt-2">
          <button type="button" class="btn-secondary" @click="editing = false">Annullér</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
        </div>
        <p v-if="error" class="text-loss text-sm">{{ error }}</p>
      </form>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Modal from '../../../components/Modal.vue'
import { foodmateApi, NUTRIENT_LABELS, type Ingredient, type RecipeDetail } from '../api'

const props = defineProps<{ recipeId: number }>()
const emit = defineEmits<{ close: []; changed: [] }>()

const detail = ref<RecipeDetail | null>(null)
const loading = ref(true)
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const oenskedePortioner = ref(1)

const form = reactive({ titel: '', beskrivelse: '', tilberedningstid: null as number | null, portioner: 1, tags: '' })
const trinKladde = ref<string[]>([])
const allIngredients = ref<Ingredient[]>([])
const nyIngrediensId = ref<number | null>(null)
const nyMaengde = ref<number | null>(null)

const tagListe = computed(() => (detail.value?.tags ?? '').split(',').map(t => t.trim()).filter(Boolean))
const skaleringsfaktor = computed(() => (detail.value && detail.value.portioner > 0 ? oenskedePortioner.value / detail.value.portioner : 1))
const skaleretPrPortion = computed(() => {
  const ud: Record<string, string> = {}
  if (!detail.value) return ud
  for (const key of Object.keys(NUTRIENT_LABELS) as (keyof typeof NUTRIENT_LABELS)[]) {
    const total = detail.value.naering_total[key]
    ud[key] = total == null ? '–' : `${Math.round((total * skaleringsfaktor.value) / oenskedePortioner.value)}`
  }
  return ud
})
const valgbareIngredienser = computed(() =>
  allIngredients.value.filter(i => !detail.value?.ingredienser.some(l => l.ingredient_id === i.id)),
)

function formatGram(g: number) {
  return g.toLocaleString('da-DK', { maximumFractionDigits: 0 })
}

function justerPortioner(delta: number) {
  oenskedePortioner.value = Math.max(1, oenskedePortioner.value + delta)
}

async function load() {
  loading.value = true
  try {
    detail.value = await foodmateApi.recipe(props.recipeId)
    oenskedePortioner.value = detail.value.portioner
  } finally {
    loading.value = false
  }
}

function startEdit() {
  if (!detail.value) return
  form.titel = detail.value.titel
  form.beskrivelse = detail.value.beskrivelse ?? ''
  form.tilberedningstid = detail.value.tilberedningstid
  form.portioner = detail.value.portioner
  form.tags = detail.value.tags ?? ''
  trinKladde.value = detail.value.trin.map(t => t.tekst)
  error.value = ''
  editing.value = true
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await foodmateApi.updateRecipe(props.recipeId, {
      titel: form.titel, beskrivelse: form.beskrivelse || null, tilberedningstid: form.tilberedningstid, portioner: form.portioner, tags: form.tags || null,
    })
    editing.value = false
    await load()
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function opdaterMaengde(ingredientId: number, maengde: number) {
  if (!maengde || maengde <= 0) return
  detail.value = await foodmateApi.setRecipeIngredient(props.recipeId, ingredientId, maengde)
  emit('changed')
}
async function fjernIngrediens(ingredientId: number) {
  detail.value = await foodmateApi.removeRecipeIngredient(props.recipeId, ingredientId)
  emit('changed')
}
async function tilfoejIngrediens() {
  if (!nyIngrediensId.value || !nyMaengde.value) return
  detail.value = await foodmateApi.setRecipeIngredient(props.recipeId, nyIngrediensId.value, nyMaengde.value)
  nyIngrediensId.value = null
  nyMaengde.value = null
  emit('changed')
}

function tilfoejTrin() {
  trinKladde.value.push('')
}
function fjernTrin(i: number) {
  trinKladde.value.splice(i, 1)
  gemTrin()
}
async function gemTrin() {
  if (!detail.value) return
  detail.value = await foodmateApi.setRecipeSteps(props.recipeId, trinKladde.value)
}

async function confirmDelete() {
  if (!detail.value || !confirm(`Slet ${detail.value.titel}? Flyttes til papirkurven.`)) return
  await foodmateApi.deleteRecipe(props.recipeId)
  emit('changed')
  emit('close')
}

onMounted(async () => {
  await load()
  allIngredients.value = await foodmateApi.ingredients()
})
</script>
