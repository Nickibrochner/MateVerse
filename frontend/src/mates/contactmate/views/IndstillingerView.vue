<template>
  <div class="space-y-6 max-w-2xl">
    <p v-if="notice" class="panel text-sm" :class="noticeIsError ? 'text-loss' : ''">{{ notice }}</p>

    <section>
      <h2 class="section-title">Google Contacts</h2>
      <div class="panel space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm">
            <span class="inline-block w-2 h-2 rounded-full mr-2" :class="settings?.contacts.forbundet ? 'bg-gain' : 'bg-stone-300'"></span>
            {{ settings?.contacts.forbundet ? 'Forbundet' : 'Ikke forbundet' }}
          </p>
          <a v-if="!settings?.contacts.forbundet" class="btn-primary" :href="contactmateApi.contactsConnectUrl()">Opret forbindelse</a>
          <button v-else type="button" class="btn-secondary" @click="disconnectContacts">Afbryd forbindelse</button>
        </div>
        <p class="text-xs text-stone-400">Giver læse- og skriveadgang til dine Google-kontakter (to-vejs sync).</p>
      </div>
    </section>

    <section>
      <h2 class="section-title">Gmail ("sidst kontaktet")</h2>
      <div class="panel space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm">
            <span class="inline-block w-2 h-2 rounded-full mr-2" :class="settings?.gmail.forbundet ? 'bg-gain' : 'bg-stone-300'"></span>
            {{ settings?.gmail.forbundet ? 'Forbundet' : 'Ikke forbundet' }}
          </p>
          <a v-if="!settings?.gmail.forbundet" class="btn-primary" :href="contactmateApi.gmailConnectUrl()">Opret forbindelse</a>
          <button v-else type="button" class="btn-secondary" @click="disconnectGmail">Afbryd forbindelse</button>
        </div>
        <p class="text-xs text-stone-400">Læseadgang (read-only) til Gmail, kun for at tælle emails og finde dato for sidste kontakt.</p>
      </div>
    </section>

    <section>
      <h2 class="section-title">Google OAuth-klient</h2>
      <div class="panel space-y-4">
        <p class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
          ⚠️ Client ID/Secret gemmes ukrypteret i databasen, samme aftale som Stockmates krypto-nøgler.
          Opret en OAuth-klient (type "Web application") i Google Cloud Console, og registrér disse to redirect-URI'er:
        </p>
        <ul class="text-xs font-mono bg-stone-50 rounded-lg p-3 space-y-1">
          <li>{{ redirectUris.contacts }}</li>
          <li>{{ redirectUris.gmail }}</li>
        </ul>
        <div v-if="settings" class="space-y-3">
          <div>
            <label class="label">Client ID</label>
            <input v-model="form.google_client_id" class="field" :placeholder="settings.google_client_id ?? 'xxxxx.apps.googleusercontent.com'">
          </div>
          <div>
            <label class="label">Client Secret</label>
            <input v-model="form.google_client_secret" class="field" type="password" :placeholder="settings.has_google_client_secret ? 'Allerede sat – indtast for at erstatte' : 'GOCSPX-…'">
          </div>
        </div>
        <div class="flex justify-end">
          <button type="button" class="btn-primary" :disabled="saving" @click="saveSettings">{{ saving ? 'Gemmer …' : 'Gem' }}</button>
        </div>
        <p v-if="saveMessage" class="text-sm text-stone-600">{{ saveMessage }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contactmateApi, type ContactMateSettings } from '../api'
import { API_URL } from '../../../api'

const route = useRoute()
const router = useRouter()

const settings = ref<ContactMateSettings | null>(null)
const form = reactive({ google_client_id: '', google_client_secret: '' })
const saving = ref(false)
const saveMessage = ref('')
const notice = ref('')
const noticeIsError = ref(false)

const redirectUris = {
  contacts: `${API_URL}/contactmate/oauth/contacts/callback`,
  gmail: `${API_URL}/contactmate/oauth/gmail/callback`,
}

async function loadSettings() {
  settings.value = await contactmateApi.settings()
  form.google_client_id = settings.value.google_client_id ?? ''
}

async function saveSettings() {
  saving.value = true
  saveMessage.value = ''
  try {
    const body: Record<string, string> = {}
    if (form.google_client_id.trim()) body.google_client_id = form.google_client_id.trim()
    if (form.google_client_secret.trim()) body.google_client_secret = form.google_client_secret.trim()
    await contactmateApi.saveSettings(body)
    form.google_client_secret = ''
    await loadSettings()
    saveMessage.value = 'Gemt.'
  } catch (e) {
    saveMessage.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function disconnectContacts() {
  await contactmateApi.disconnectContacts()
  await loadSettings()
}
async function disconnectGmail() {
  await contactmateApi.disconnectGmail()
  await loadSettings()
}

onMounted(async () => {
  const connected = route.query.connected as string | undefined
  const error = route.query.error as string | undefined
  if (connected) notice.value = connected === 'gmail' ? 'Gmail forbundet!' : 'Google Contacts forbundet!'
  if (error) {
    notice.value = error
    noticeIsError.value = true
  }
  if (connected || error) router.replace({ path: route.path })
  await loadSettings()
})
</script>
