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

    <section>
      <h2 class="section-title">Hjem</h2>
      <div class="panel space-y-4">
        <p class="text-sm text-stone-600">
          Hjemmepunktet bruges til at regne hjemme- og udetid og til at holde hjemmet ude af kattens favoritsteder.
          Alt inden for radius tæller som hjemme.
        </p>
        <form class="space-y-3" @submit.prevent="gemHjem">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="label" for="catmate-lat">Breddegrad</label>
              <input id="catmate-lat" v-model="hjem.lat" class="field" inputmode="decimal" placeholder="55,6761" required>
            </div>
            <div>
              <label class="label" for="catmate-lng">Længdegrad</label>
              <input id="catmate-lng" v-model="hjem.lng" class="field" inputmode="decimal" placeholder="12,5683" required>
            </div>
            <div>
              <label class="label" for="catmate-radius">Radius (m)</label>
              <input id="catmate-radius" v-model.number="hjem.radius" class="field" type="number" min="10" max="500" step="5" required>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-3">
            <p v-if="hjemBesked" class="text-sm mr-auto" :class="hjemFejl ? 'text-loss' : 'text-stone-600'">{{ hjemBesked }}</p>
            <button v-if="settings?.forbundet" type="button" class="btn-secondary" :disabled="finder" @click="brugKattensPosition">
              {{ finder ? 'Henter …' : '📍 Brug kattens position nu' }}
            </button>
            <button type="submit" class="btn-primary" :disabled="!hjemGyldigt">Gem hjem</button>
          </div>
        </form>
        <p class="text-xs text-stone-400">
          Nemmest: tryk "Brug kattens position nu", mens katten er hjemme, og gem. En radius på 40–60 m dækker typisk hus og have
          og giver plads til GPS-usikkerheden indendørs.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { catApi, sidenTekst, type CatMateSettings } from '../api'

const settings = ref<CatMateSettings | null>(null)
const form = reactive({ email: '', password: '' })
const saving = ref(false)
const message = ref('')
const isError = ref(false)

const hjem = reactive({ lat: '', lng: '', radius: 50 })
const hjemBesked = ref('')
const hjemFejl = ref(false)
const finder = ref(false)
const tal = (s: string) => parseFloat(String(s).replace(',', '.'))
const hjemGyldigt = computed(() => {
  const lat = tal(hjem.lat), lng = tal(hjem.lng)
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && hjem.radius >= 10 && hjem.radius <= 500
})

async function gemHjem() {
  hjemFejl.value = false
  try {
    vis(await catApi.setHjem({ lat: tal(hjem.lat), lng: tal(hjem.lng), radius: hjem.radius }))
    hjemBesked.value = 'Hjemmepunktet er gemt.'
  } catch (e) {
    hjemBesked.value = (e as Error).message
    hjemFejl.value = true
  }
}

async function brugKattensPosition() {
  finder.value = true
  hjemFejl.value = false
  try {
    const position = (await catApi.pets()).find(p => p.position)?.position
    if (!position) throw new Error('Trackeren har ikke meldt en position endnu')
    hjem.lat = String(position.lat)
    hjem.lng = String(position.lng)
    hjemBesked.value = `Udfyldt med positionen fra ${sidenTekst(position.time)} – tryk Gem hjem.`
  } catch (e) {
    hjemBesked.value = (e as Error).message
    hjemFejl.value = true
  } finally {
    finder.value = false
  }
}

function vis(s: CatMateSettings) {
  settings.value = s
  if (s.hjem) Object.assign(hjem, { lat: String(s.hjem.lat), lng: String(s.hjem.lng), radius: s.hjem.radius })
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
