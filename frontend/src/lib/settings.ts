import { ref, watch } from 'vue'

/**
 * MateVerses indstillinger. Gemmes pr. browser (localStorage) – det er visningspræferencer,
 * ikke data, og er derfor ikke delt mellem enheder (ligesom kort-rækkefølgen i mateOrder.ts).
 */
export type Layout = 'topbar' | 'sidebar'

const STORAGE_KEY = 'mateverse:layout'

function load(): Layout {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'sidebar' ? 'sidebar' : 'topbar'
  } catch {
    return 'topbar'
  }
}

export const layout = ref<Layout>(load())

watch(layout, v => {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    // localStorage kan være blokeret (privat browsing) – indstillingen gælder kun for denne session.
  }
})
