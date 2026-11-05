<template>
  <KinPage title="Kilder og forskningslog">
    <template #actions>
      <button type="button" class="btn-primary" @click="åbn(null)">+ Ny kilde</button>
    </template>

    <section>
      <h2 class="section-title">Kilder ({{ store.kilder.length }})</h2>
      <p v-if="!store.kilder.length" class="text-stone-500">Ingen kilder registreret endnu.</p>
      <ul v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <li v-for="k in store.kilder" :key="k.id" class="panel !p-4 flex gap-3">
          <div class="flex-1 min-w-0 text-sm">
            <strong>{{ k.titel }}</strong>
            <span v-if="k.type_" class="tag bg-stone-100 text-stone-500 ml-2">{{ k.type_ }}</span>
            <div v-if="k.arkiv_reference" class="text-stone-500">{{ k.arkiv_reference }}</div>
            <a v-if="k.url" :href="k.url" target="_blank" rel="noopener" class="text-accent hover:underline break-all">{{ k.url }}</a>
            <div class="text-xs text-stone-400 mt-1">
              {{ koblinger(k.id).length }} tilknytning(er)<template v-if="koblinger(k.id).length">:
                <template v-for="(kb, i) in koblinger(k.id)" :key="kb.id">
                  <router-link v-if="kb.person_id" :to="`/kinmate/personer/${kb.person_id}`" class="hover:text-accent">{{ navn(kb.person_id) }}</router-link><template v-if="i < koblinger(k.id).length - 1">, </template>
                </template>
              </template>
            </div>
          </div>
          <button type="button" class="btn-icon" aria-label="Rediger" @click="åbn(k)">✎</button>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="section-title">Åbne forskningsopgaver ({{ åbne.length }})</h2>
      <p v-if="!åbne.length" class="text-stone-500">Ingen åbne spørgsmål – flot! 🎉</p>
      <ul v-else class="panel !p-0 divide-y divide-stone-100 text-sm">
        <li v-for="o in åbne" :key="o.id" class="flex items-center gap-3 px-4 py-2.5">
          <span class="flex-1">{{ o.beskrivelse }} <span class="text-stone-400">– {{ navn(o.person_id) }}</span></span>
          <router-link :to="`/kinmate/personer/${o.person_id}`" class="btn-secondary !py-1 !text-xs">Åbn person</router-link>
        </li>
      </ul>
    </section>

    <Modal :open="formOpen" :title="redigerer ? 'Rediger kilde' : 'Ny kilde'" @close="formOpen = false">
      <form class="space-y-3" @submit.prevent="gem">
        <div>
          <label class="label">Titel</label>
          <input v-model="form.titel" class="field" required placeholder="Fx 'Kirkebog for Ribe, 1840-1860'">
        </div>
        <div>
          <label class="label">Type</label>
          <select v-model="form.type_" class="field">
            <option :value="null">Vælg</option>
            <option v-for="t in ['kirkebog', 'folketælling', 'skifte', 'andet']" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div>
          <label class="label">Arkivreference</label>
          <input v-model="form.arkiv_reference" class="field" placeholder="Fx 'Rigsarkivet, opslag 42'">
        </div>
        <div>
          <label class="label">URL (valgfrit)</label>
          <input v-model="form.url" type="url" class="field" placeholder="https://…">
        </div>
        <div>
          <label class="label">Noter</label>
          <textarea v-model="form.noter" rows="2" class="field" />
        </div>
        <div class="flex items-center gap-2 pt-2">
          <ConfirmButton v-if="redigerer" label="Slet kilden og alle tilknytninger" @confirm="slet" />
          <button type="button" class="btn-secondary ml-auto" @click="formOpen = false">Annuller</button>
          <button type="submit" class="btn-primary">Gem</button>
        </div>
      </form>
    </Modal>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Modal from '../../../components/Modal.vue'
import ConfirmButton from '../../../components/ConfirmButton.vue'
import KinPage from '../components/KinPage.vue'
import { kinApi, type Kilde, type KildeInput } from '../api'
import { useKinStore } from '../store'

const store = useKinStore()
const koblinger = (kildeId: string) => store.kildeKoblinger.filter(k => k.kilde_id === kildeId)
const navn = (id: string | null) => store.persons.find(p => p.id === id)?.navn ?? 'Ukendt'
const åbne = computed(() => store.forskningsopgaver.filter(o => o.status !== 'løst'))

const formOpen = ref(false)
const redigerer = ref<Kilde | null>(null)
const form = reactive<KildeInput>({ titel: '', type_: null, arkiv_reference: '', url: '', noter: '' })

function åbn(k: Kilde | null) {
  redigerer.value = k
  Object.assign(form, k
    ? { titel: k.titel, type_: k.type_, arkiv_reference: k.arkiv_reference ?? '', url: k.url ?? '', noter: k.noter ?? '' }
    : { titel: '', type_: null, arkiv_reference: '', url: '', noter: '' })
  formOpen.value = true
}
async function gem() {
  if (redigerer.value) await kinApi.updateKilde(redigerer.value.id, { ...form })
  else await kinApi.createKilde({ ...form })
  formOpen.value = false
  await store.loadAll()
}
async function slet() {
  await kinApi.deleteKilde(redigerer.value!.id)
  formOpen.value = false
  await store.loadAll()
}
</script>
