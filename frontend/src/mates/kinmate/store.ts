import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { kinApi, type Forskningsopgave, type Kilde, type KildeKobling, type Person, type Relation, type Sted } from './api'

/** Kinmates data hentes samlet og deles af alle sider – som i Tauri-udgaven. */
export const useKinStore = defineStore('kinmate', () => {
  const persons = ref<Person[]>([])
  const relations = ref<Relation[]>([])
  const kilder = ref<Kilde[]>([])
  const kildeKoblinger = ref<KildeKobling[]>([])
  const forskningsopgaver = ref<Forskningsopgave[]>([])
  const steder = ref<Sted[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function loadAll() {
    try {
      const d = await kinApi.data()
      persons.value = d.persons
      relations.value = d.relations
      kilder.value = d.kilder
      kildeKoblinger.value = d.kilde_koblinger
      forskningsopgaver.value = d.forskningsopgaver
      steder.value = d.steder
      loaded.value = true
      error.value = null
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  /** Henter kun, første gang en side åbnes. */
  const ensureLoaded = () => (loaded.value ? Promise.resolve() : loadAll())

  /** Antal personer uden køn plus personer helt uden relationer. */
  const kvalitetAdvarsel = computed(() => {
    const ingenKøn = persons.value.filter(p => !p.køn).length
    const medRelation = new Set(relations.value.flatMap(r => [r.person1_id, r.person2_id]))
    return ingenKøn + persons.value.filter(p => !medRelation.has(p.id)).length
  })
  const åbneForskningsopgaver = computed(() => forskningsopgaver.value.filter(o => o.status !== 'løst').length)

  return { persons, relations, kilder, kildeKoblinger, forskningsopgaver, steder, loaded, error, loadAll, ensureLoaded, kvalitetAdvarsel, åbneForskningsopgaver }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useKinStore, import.meta.hot))
