import { computed, ref } from 'vue'
import { MATES, type MateInfo } from '../mates'

/**
 * Brugerens egen rækkefølge for kortene i hubben og mate-skifteren. Gemmes pr. browser
 * (localStorage), ikke delt i databasen – det er en visningspræference, ikke data.
 */
const STORAGE_KEY = 'mateverse:kort-raekkefolge'

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

const savedOrder = ref<string[]>(load())

/** Gemt rækkefølge, udfyldt med nye mates til sidst og uden mates, der ikke længere findes. */
export const orderedMates = computed<MateInfo[]>(() => {
  const byId = new Map(MATES.map(m => [m.id, m]))
  const known = savedOrder.value.filter(id => byId.has(id))
  const missing = MATES.filter(m => !known.includes(m.id)).map(m => m.id)
  return [...known, ...missing].map(id => byId.get(id)!)
})

export function reorderMates(ids: string[]) {
  savedOrder.value = ids
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // localStorage kan være blokeret (privat browsing) – rækkefølgen falder tilbage til standard.
  }
}
