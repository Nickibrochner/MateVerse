/**
 * Scoring for kortspillet "500". Port 1:1 af Tauri-udgavens scoring.rs, inkl. dens enhedstests
 * (se 500mate.test.ts) — ret ikke i denne logik uden at opdatere testene tilsvarende.
 */

export const FARVER = ['spar', 'klør', 'ruder', 'hjerte', 'sans', 'nullo'] as const
export type Farve = (typeof FARVER)[number]

const KONTRAKT_BASE: Record<string, number> = { spar: 40, klør: 60, ruder: 80, hjerte: 100, sans: 120 }

export function kontraktVaerdi(farve: string, antal: number): number {
  const base = KONTRAKT_BASE[farve]
  if (base === undefined) throw new Error(`Ukendt farve: ${farve}`)
  return base + Math.max(antal - 6, 0) * 100
}

/** Point til melderen (den der har budt): positivt hvis kontrakten blev holdt, negativt hvis ej. */
export function beregnMelderPoint(farve: string, antal: number, stik: number): number {
  if (farve === 'nullo') return stik === 0 ? 250 : -250
  const vaerdi = kontraktVaerdi(farve, antal)
  if (stik >= antal) return stik === 10 ? Math.max(vaerdi, 250) : vaerdi
  return -vaerdi
}

/** Point til en modspiller (eller alle spillere, hvis ingen meldte): 10 point pr. stik. */
export function beregnModspillerPoint(stik: number): number {
  return stik * 10
}
