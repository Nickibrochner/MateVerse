<template>
  <Modal :open="true" :title="detail?.contact.visningsnavn ?? 'Kontakt'" wide @close="$emit('close')">
    <p v-if="loading" class="text-stone-500 py-6 text-center">Henter …</p>
    <div v-else-if="detail" class="space-y-4">
      <p v-if="detail.contact.ny_fra_google" class="text-sm bg-sky-50 text-sky-700 rounded-lg p-2.5">🆕 Ny fra Google</p>
      <p v-if="detail.contact.lokalt_redigeret" class="text-sm bg-amber-50 text-amber-700 rounded-lg p-2.5 flex items-center justify-between gap-2">
        <span>✏️ Redigeret lokalt — overskrives ikke ved næste sync fra Google</span>
        <button type="button" class="btn-secondary !py-1 !px-2 !text-xs shrink-0" @click="resetToGoogle">Nulstil</button>
      </p>

      <div class="flex flex-wrap gap-1" v-if="detail.groups.length">
        <span v-for="g in detail.groups" :key="g" class="tag bg-stone-100 text-stone-600">{{ g }}</span>
      </div>

      <div v-if="!editing" class="space-y-3">
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt class="label">Firma</dt><dd>{{ detail.contact.firma || '–' }}</dd></div>
          <div><dt class="label">Titel</dt><dd>{{ detail.contact.titel || '–' }}</dd></div>
          <div><dt class="label">Fødselsdag</dt><dd>{{ birthdayLabel }}</dd></div>
          <div><dt class="label">Adresse</dt><dd>{{ addressLabel }}</dd></div>
        </dl>
        <p v-if="detail.contact.noter" class="text-sm whitespace-pre-wrap">{{ detail.contact.noter }}</p>

        <div class="space-y-1">
          <div v-for="e in detail.emails" :key="e.id" class="flex items-center gap-2 text-sm">
            <span>{{ e.email }}</span>
            <span v-if="e.primaer" class="tag bg-accent/10 text-accent">primær</span>
            <span v-if="e.klassificering" class="text-xs text-stone-400" :class="e.klassificering.startsWith('auto_') && 'italic'">
              {{ classificationLabel(e.klassificering) }}
            </span>
          </div>
          <div v-for="t in detail.phones" :key="t.id" class="flex items-center gap-2 text-sm">
            <span>{{ t.nummer }}</span>
            <span v-if="t.primaer" class="tag bg-accent/10 text-accent">primær</span>
          </div>
        </div>

        <div class="flex justify-between pt-2">
          <button type="button" class="btn-secondary !text-loss" @click="confirmDelete">Slet kontakt</button>
          <button type="button" class="btn-primary" @click="startEdit">Redigér</button>
        </div>
      </div>

      <form v-else class="space-y-4" @submit.prevent="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label class="label">Fornavn</label><input v-model="form.fornavn" class="field"></div>
          <div><label class="label">Efternavn</label><input v-model="form.efternavn" class="field"></div>
          <div><label class="label">Firma</label><input v-model="form.firma" class="field"></div>
          <div><label class="label">Titel</label><input v-model="form.titel" class="field"></div>
          <div>
            <label class="label">Fødselsdag</label>
            <input v-model="form.foedselsdag" type="date" class="field">
            <label class="flex items-center gap-1.5 mt-1 text-xs text-stone-500">
              <input v-model="form.foedselsdag_uden_aar" type="checkbox"> Årstal ukendt
            </label>
          </div>
          <div><label class="label">Gade</label><input v-model="form.adresse_gade" class="field"></div>
          <div><label class="label">By</label><input v-model="form.adresse_by" class="field"></div>
          <div><label class="label">Postnr.</label><input v-model="form.adresse_postnr" class="field"></div>
          <div><label class="label">Land</label><input v-model="form.adresse_land" class="field"></div>
        </div>
        <div><label class="label">Noter</label><textarea v-model="form.noter" class="field" rows="3"></textarea></div>

        <div class="space-y-2">
          <p class="label !mb-2">Emails</p>
          <div v-for="e in emailForms" :key="e.id" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="flex-1 min-w-[10rem]">{{ e.email }}</span>
            <select v-model="e.type" class="field !w-auto !py-1">
              <option value="">Type …</option>
              <option value="home">Hjemme</option>
              <option value="work">Arbejde</option>
              <option value="other">Andet</option>
            </select>
            <select v-model="e.klassificering" class="field !w-auto !py-1">
              <option value="">Ingen kategori</option>
              <option value="privat">Privat</option>
              <option value="arbejde">Arbejde</option>
            </select>
            <label class="flex items-center gap-1 text-xs"><input v-model="primaryEmailId" type="radio" :value="e.id"> primær</label>
            <button type="button" class="btn-icon" @click="removeEmail(e.id)">✕</button>
          </div>

          <p class="label !mb-2 !mt-4">Telefonnumre</p>
          <div v-for="t in phoneForms" :key="t.id" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="flex-1 min-w-[10rem]">{{ t.nummer }}</span>
            <select v-model="t.type" class="field !w-auto !py-1">
              <option value="">Type …</option>
              <option value="home">Hjemme</option>
              <option value="work">Arbejde</option>
              <option value="mobile">Mobil</option>
            </select>
            <label class="flex items-center gap-1 text-xs"><input v-model="primaryPhoneId" type="radio" :value="t.id"> primær</label>
            <button type="button" class="btn-icon" @click="removePhone(t.id)">✕</button>
          </div>
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
import { contactmateApi, type ContactDetail, type ContactEmail, type ContactPhone } from '../api'

const props = defineProps<{ contactId: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()

const detail = ref<ContactDetail | null>(null)
const loading = ref(true)
const editing = ref(false)
const saving = ref(false)
const error = ref('')

const form = reactive({
  fornavn: '', efternavn: '', firma: '', titel: '', noter: '',
  foedselsdag: '', foedselsdag_uden_aar: false,
  adresse_gade: '', adresse_by: '', adresse_postnr: '', adresse_land: '',
})
const emailForms = ref<ContactEmail[]>([])
const phoneForms = ref<ContactPhone[]>([])
const primaryEmailId = ref<string | null>(null)
const primaryPhoneId = ref<string | null>(null)

const birthdayLabel = computed(() => {
  const c = detail.value?.contact
  if (!c?.foedselsdag) return '–'
  return c.foedselsdag_uden_aar ? c.foedselsdag.slice(5) : c.foedselsdag
})
const addressLabel = computed(() => {
  const c = detail.value?.contact
  if (!c) return '–'
  const parts = [c.adresse_gade, [c.adresse_postnr, c.adresse_by].filter(Boolean).join(' '), c.adresse_land].filter(Boolean)
  return parts.length ? parts.join(', ') : '–'
})

function classificationLabel(v: string) {
  const base = v.replace(/^auto_/, '')
  const label = base === 'privat' ? 'privat' : base === 'arbejde' ? 'arbejde' : base
  return v.startsWith('auto_') ? `${label} (gæt)` : label
}

async function load() {
  loading.value = true
  try {
    detail.value = await contactmateApi.contact(props.contactId)
  } finally {
    loading.value = false
  }
}

function startEdit() {
  const c = detail.value!.contact
  form.fornavn = c.fornavn ?? ''
  form.efternavn = c.efternavn ?? ''
  form.firma = c.firma ?? ''
  form.titel = c.titel ?? ''
  form.noter = c.noter ?? ''
  form.foedselsdag = c.foedselsdag ?? ''
  form.foedselsdag_uden_aar = !!c.foedselsdag_uden_aar
  form.adresse_gade = c.adresse_gade ?? ''
  form.adresse_by = c.adresse_by ?? ''
  form.adresse_postnr = c.adresse_postnr ?? ''
  form.adresse_land = c.adresse_land ?? ''
  emailForms.value = detail.value!.emails.map(e => ({ ...e, klassificering: (e.klassificering ?? '').replace(/^auto_/, '') }))
  phoneForms.value = detail.value!.phones.map(t => ({ ...t }))
  primaryEmailId.value = emailForms.value.find(e => e.primaer)?.id ?? null
  primaryPhoneId.value = phoneForms.value.find(t => t.primaer)?.id ?? null
  error.value = ''
  editing.value = true
}

function removeEmail(id: string) {
  emailForms.value = emailForms.value.filter(e => e.id !== id)
}
function removePhone(id: string) {
  phoneForms.value = phoneForms.value.filter(t => t.id !== id)
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await contactmateApi.updateContact(props.contactId, {
      fornavn: form.fornavn || null,
      efternavn: form.efternavn || null,
      firma: form.firma || null,
      titel: form.titel || null,
      noter: form.noter || null,
      foedselsdag: form.foedselsdag || null,
      foedselsdag_uden_aar: form.foedselsdag_uden_aar,
      adresse_gade: form.adresse_gade || null,
      adresse_by: form.adresse_by || null,
      adresse_postnr: form.adresse_postnr || null,
      adresse_land: form.adresse_land || null,
    })

    const removedEmails = detail.value!.emails.filter(e => !emailForms.value.some(f => f.id === e.id))
    for (const e of removedEmails) await contactmateApi.deleteEmail(e.id)
    for (const e of emailForms.value) {
      await contactmateApi.updateEmail(e.id, {
        type: e.type || null, primaer: primaryEmailId.value === e.id, klassificering: e.klassificering || null,
      })
    }

    const removedPhones = detail.value!.phones.filter(t => !phoneForms.value.some(f => f.id === t.id))
    for (const t of removedPhones) await contactmateApi.deletePhone(t.id)
    for (const t of phoneForms.value) {
      await contactmateApi.updatePhone(t.id, { type: t.type || null, primaer: primaryPhoneId.value === t.id })
    }

    editing.value = false
    await load()
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function resetToGoogle() {
  await contactmateApi.acceptGoogleData(props.contactId)
  await load()
  emit('changed')
}

async function confirmDelete() {
  if (!confirm(`Slet ${detail.value?.contact.visningsnavn}? Dette kan ikke fortrydes.`)) return
  try {
    await contactmateApi.deleteContact(props.contactId)
    emit('changed')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(load)
</script>
