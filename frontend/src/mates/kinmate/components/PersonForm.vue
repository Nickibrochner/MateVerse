<template>
  <form class="space-y-4" @submit.prevent="save">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="label">Navn</label>
        <input v-model="form.navn" class="field" placeholder="Fulde navn" required>
      </div>
      <div>
        <label class="label">Køn</label>
        <select v-model="form.køn" class="field">
          <option :value="null">Vælg</option>
          <option value="mand">Mand</option>
          <option value="kvinde">Kvinde</option>
          <option value="andet">Andet</option>
        </select>
      </div>
      <div class="space-y-2">
        <label class="label">Fødsel</label>
        <input v-model="form.fødselsdato" class="field" placeholder="ÅÅÅÅ-MM-DD, ÅÅÅÅ-MM eller ÅÅÅÅ" pattern="\d{4}(-\d{2}(-\d{2})?)?">
        <input v-model="form.fødselsogn" class="field" placeholder="Fødselssogn" list="kin-sogne">
      </div>
      <div class="space-y-2">
        <label class="label">Død (valgfrit)</label>
        <input v-model="form.dødsdato" class="field" placeholder="ÅÅÅÅ-MM-DD, ÅÅÅÅ-MM eller ÅÅÅÅ" pattern="\d{4}(-\d{2}(-\d{2})?)?">
        <input v-model="form.dødssogn" class="field" placeholder="Dødssogn" list="kin-sogne">
      </div>
      <datalist id="kin-sogne">
        <option v-for="s in sogne" :key="s" :value="s" />
      </datalist>
      <div class="sm:col-span-2">
        <label class="label">Noter</label>
        <textarea v-model="form.noter" rows="2" class="field resize-y" placeholder="Evt. noter" />
      </div>
    </div>
    <p class="text-xs text-stone-400">Datoer kan være hele datoer, år og måned eller kun årstal.</p>
    <p v-if="error" class="text-loss text-sm">{{ error }}</p>
    <div class="flex items-center gap-2">
      <ConfirmButton v-if="person" label="Slet personen og alle relationer" @confirm="remove" />
      <button type="button" class="btn-secondary ml-auto" @click="$emit('close')">Annuller</button>
      <button type="submit" class="btn-primary" :disabled="saving">Gem</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import { kinApi, type Person, type PersonInput } from '../api'
import { useKinStore } from '../store'

const props = defineProps<{ person: Person | null }>()
const emit = defineEmits<{ saved: [Person | null]; close: [] }>()
const store = useKinStore()

const form = reactive<PersonInput>({
  navn: props.person?.navn ?? '',
  køn: props.person?.køn ?? null,
  fødselsdato: props.person?.fødselsdato ?? '',
  fødselsogn: props.person?.fødselsogn ?? '',
  dødsdato: props.person?.dødsdato ?? '',
  dødssogn: props.person?.dødssogn ?? '',
  noter: props.person?.noter ?? '',
})
const sogne = computed(() =>
  [...new Set(store.persons.flatMap(p => [p.fødselsogn, p.dødssogn]).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'da')))
const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    const p = props.person ? await kinApi.updatePerson(props.person.id, { ...form }) : await kinApi.createPerson({ ...form })
    await store.loadAll()
    emit('saved', p)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  await kinApi.deletePerson(props.person!.id)
  await store.loadAll()
  emit('saved', null)
}
</script>
