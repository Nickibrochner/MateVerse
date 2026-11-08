/**
 * Næringsberegning for FoodMate. Alle værdier på en ingrediens er pr. 100 g; en opskriftslinje
 * skaleres med `maengde_gram * vaerdi_pr_100g / 100`. Port af Tauri-udgavens kernelogik.
 */

export const NUTRIENT_FELTER = [
  'energi_kcal', 'protein', 'kulhydrat', 'fedt', 'kostfibre', 'sukkerarter', 'maettet_fedt', 'salt',
] as const
export type NutrientFelt = (typeof NUTRIENT_FELTER)[number]
export type Nutrients = Record<NutrientFelt, number | null>

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function skaler(per100g: number | null, gram: number): number | null {
  if (per100g == null) return null
  return round2((per100g * gram) / 100)
}

/** Summerer næring for en liste af opskriftslinjer. Et felt bliver null kun hvis INGEN linjer bidrager til det. */
export function summerNaering(linjer: { ingrediens: Nutrients; gram: number }[]): Nutrients {
  const total = {} as Nutrients
  for (const felt of NUTRIENT_FELTER) {
    let sum = 0
    let nogen = false
    for (const l of linjer) {
      const v = skaler(l.ingrediens[felt], l.gram)
      if (v != null) {
        sum += v
        nogen = true
      }
    }
    total[felt] = nogen ? round2(sum) : null
  }
  return total
}

/** Deler et næringssæt med et antal portioner (bruges til "pr. portion" og live portionsskalering). */
export function prPortion(total: Nutrients, portioner: number): Nutrients {
  const ud = {} as Nutrients
  for (const felt of NUTRIENT_FELTER) {
    ud[felt] = total[felt] == null || portioner <= 0 ? total[felt] : round2(total[felt]! / portioner)
  }
  return ud
}

/** Omregner en opskrifts samlede næring til "pr. 100 g af hele retten" ud fra den samlede gram-mængde. */
export function pr100g(total: Nutrients, totalGram: number): Nutrients {
  const ud = {} as Nutrients
  for (const felt of NUTRIENT_FELTER) {
    ud[felt] = total[felt] == null || totalGram <= 0 ? total[felt] : round2((total[felt]! / totalGram) * 100)
  }
  return ud
}

/** Næring for en given mængde (gram) af en ret, ud fra dens næring pr. 100 g. Bruges til dagbogslogning. */
export function forGram(pr100gVaerdi: Nutrients, gram: number): Nutrients {
  const ud = {} as Nutrients
  for (const felt of NUTRIENT_FELTER) ud[felt] = skaler(pr100gVaerdi[felt], gram)
  return ud
}
