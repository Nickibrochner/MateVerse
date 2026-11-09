<template>
  <div class="space-y-6 max-w-2xl">
    <section>
      <h2 class="section-title">Tractive</h2>
      <div class="panel space-y-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm">
            <span class="inline-block w-2 h-2 rounded-full mr-2" :class="settings?.forbundet ? 'bg-gain' : 'bg-stone-300'"></span>
            {{ settings?.forbundet ? `Forbundet som ${settings.email}` : 'Ikke forbundet' }}
          </p>
          <button v-if="settings?.forbundet" type="button" class="btn-secondary" @click="disconnect">Afbryd forbindelse</button>
        </div>

        <form class="space-y-3" @submit.prevent="connect">
          <div>
            <label class="label" for="catmate-email">Email</label>
            <input id="catmate-email" v-model="form.email" class="field" type="email" autocomplete="username" placeholder="Din Tractive-email" required>
          </div>
          <div>
            <label class="label" for="catmate-password">Adgangskode</label>
            <input
              id="catmate-password"
              v-model="form.password"
              class="field"
              type="password"
              autocomplete="current-password"
              :placeholder="settings?.forbundet ? 'Allerede sat – indtast for at erstatte' : 'Din Tractive-adgangskode'"
              required
            >
          </div>
          <div class="flex items-center justify-end gap-3">
            <p v-if="message" class="text-sm mr-auto" :class="isError ? 'text-loss' : 'text-stone-600'">{{ message }}</p>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Logger ind …' : settings?.forbundet ? 'Skift login' : 'Opret forbindelse' }}</button>
          </div>
        </form>

        <p class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
          ⚠️ Email og adgangskode gemmes ukrypteret i databasen, samme aftale som ContactMate og Stockmates krypto-nøgler.
          Tractive har ikke et officielt API med nøgler, så CatMate logger ind på samme måde som Tractives egen app.
        </p>
        <p class="text-xs text-stone-400">
          CatMate læser kun: position, rute og batteri. Der sendes ingen kommandoer til trackeren, så live-tracking, lys og lyd
          styres stadig fra Tractive-appen. Login prøves af, før det gemmes.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { catApi, type CatMateSettings } from '../api'

const settings = ref<CatMateSettings | null>(null)
const form = reactive({ email: '', password: '' })
const saving = ref(false)
const message = ref('')
const isError = ref(false)

function vis(s: CatMateSettings) {
  settings.value = s
  form.email = s.email ?? ''
  form.password = ''
}

async function connect() {
  saving.value = true
  message.value = ''
  isError.value = false
  try {
    vis(await catApi.connect(form.email, form.password))
    message.value = 'Forbundet til Tractive.'
  } catch (e) {
    message.value = (e as Error).message
    isError.value = true
  } finally {
    saving.value = false
  }
}

async function disconnect() {
  vis(await catApi.disconnect())
  message.value = 'Forbindelsen er afbrudt, og login er slettet.'
  isError.value = false
}

onMounted(async () => {
  try {
    vis(await catApi.settings())
  } catch (e) {
    message.value = (e as Error).message
    isError.value = true
  }
})
</script>
