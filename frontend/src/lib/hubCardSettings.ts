import { ref } from 'vue'
import { HUB_INFO_OPTIONS } from './hubCardInfo'

/**
 * Hvilken "ekstra info"-linje der vises på hvert mate-kort i hubben. Gemmes pr. browser
 * (localStorage), ikke delt i databasen – det er en visningspræference, som kort-rækkefølgen
 * i mateOrder.ts og layout-valget i settings.ts.
 */
const STORAGE_KEY = 'mateverse:kort-info'

const NONE = 'none'

function defaults(): Record<string, string> {
  return Object.fromEntries(Object.entries(HUB_INFO_OPTIONS).map(([mateId, options]) => [mateId, options[0]?.id ?? NONE]))
}

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : null
    return { ...defaults(), ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return defaults()
  }
}

export const cardInfoSelection = ref<Record<string, string>>(load())

export function setCardInfo(mateId: string, optionId: string) {
  cardInfoSelection.value = { ...cardInfoSelection.value, [mateId]: optionId }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cardInfoSelection.value))
  } catch {
    // localStorage kan være blokeret (privat browsing) – valget gælder kun for denne session.
  }
}

/** Den valgte mulighed for en mate, eller null hvis "Ingen" er valgt (eller mate'en ikke har nogen muligheder). */
export function activeCardInfoOption(mateId: string) {
  const optionId = cardInfoSelection.value[mateId]
  if (!optionId || optionId === NONE) return null
  return HUB_INFO_OPTIONS[mateId]?.find(o => o.id === optionId) ?? null
}
