import type { Nutrients } from './nutrition'

/**
 * Søgning mod Open Food Facts' offentlige API (ingen nøgle krævet) til hurtigt at oprette en
 * ingrediens med importerede næringsværdier i stedet for at slå dem op og indtaste dem manuelt.
 */

export interface OffTraeffer {
  navn: string
  naering: Nutrients
}

interface OffProduct {
  product_name_da?: string
  product_name?: string
  generic_name?: string
  nutriments?: Record<string, unknown>
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function soegOpenFoodFacts(query: string): Promise<OffTraeffer[]> {
  // Den gamle cgi/search.pl-søgning er lukket ned af Open Food Facts; search-a-licious er afløseren.
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=da&page_size=15` +
    `&fields=product_name,product_name_da,generic_name,nutriments`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Open Food Facts svarede ${res.status}`)
  const data = (await res.json()) as { hits?: OffProduct[] }

  return (data.hits ?? [])
    .map(p => {
      const n = p.nutriments ?? {}
      return {
        navn: p.product_name_da || p.product_name || p.generic_name || '',
        naering: {
          energi_kcal: num(n['energy-kcal_100g']),
          protein: num(n['proteins_100g']),
          kulhydrat: num(n['carbohydrates_100g']),
          fedt: num(n['fat_100g']),
          kostfibre: num(n['fiber_100g']),
          sukkerarter: num(n['sugars_100g']),
          maettet_fedt: num(n['saturated-fat_100g']),
          salt: num(n['salt_100g']),
        },
      }
    })
    .filter(p => p.navn)
}
