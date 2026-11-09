/** Ren geometri for CatMate: afstande og nøgletal for en rute. Ingen database eller net. */

export interface Point {
  time: number
  lat: number
  lng: number
  speed: number | null
  altitude: number | null
  uncertainty: number | null
  sensor: string | null
}

const R = 6_371_000
const rad = (deg: number) => (deg * Math.PI) / 180

/** Afstand i meter mellem to koordinater (haversine). */
export function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * En GPS-tracker, der ligger stille, "hopper" stadig nogle meter rundt. Skridt under denne
 * grænse tælles ikke med i den tilbagelagte afstand, ellers går en sovende kat flere kilometer.
 */
export const STØJ_METER = 15

export interface RuteStat {
  punkter: number
  /** Tilbagelagt afstand i meter, renset for GPS-støj. */
  afstand_m: number
  /** Længste afstand i luftlinje fra rutens første punkt. */
  max_fra_start_m: number
  fra: number | null
  til: number | null
}

export function ruteStat(points: Point[]): RuteStat {
  let afstand = 0
  let max = 0
  let anker = points[0]
  for (const p of points) {
    const skridt = distance(anker, p)
    const usikkerhed = Math.max(STØJ_METER, p.uncertainty ?? 0)
    if (skridt >= usikkerhed) {
      afstand += skridt
      anker = p
    }
    max = Math.max(max, distance(points[0], p))
  }
  return {
    punkter: points.length,
    afstand_m: Math.round(afstand),
    max_fra_start_m: Math.round(max),
    fra: points[0]?.time ?? null,
    til: points[points.length - 1]?.time ?? null,
  }
}
