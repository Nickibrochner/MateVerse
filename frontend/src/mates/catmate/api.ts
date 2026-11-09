import { json, request } from '../../api'

export interface Point {
  /** Unix-sekunder. */
  time: number
  lat: number
  lng: number
  /** m/s */
  speed: number | null
  altitude: number | null
  /** Usikkerhed på positionen i meter. */
  uncertainty: number | null
  sensor: string | null
}

export interface Pet {
  tracker_id: string
  navn: string
  art: string | null
  model: string | null
  batteri: number | null
  lader: boolean | null
  tilstand: string | null
  status_time: number | null
  position: Point | null
}

export interface Rute {
  points: Point[]
  /** 'cache' = Tractive svarede ikke, så kun de lokalt gemte punkter vises. */
  kilde: 'live' | 'cache'
  fejl: string | null
  stat: { punkter: number; afstand_m: number; max_fra_start_m: number; fra: number | null; til: number | null }
}

export interface CatMateSettings {
  email: string | null
  forbundet: boolean
}

export const catApi = {
  settings: () => request<CatMateSettings>('/catmate/settings'),
  connect: (email: string, password: string) => request<CatMateSettings>('/catmate/settings', json('PUT', { email, password })),
  disconnect: () => request<CatMateSettings>('/catmate/settings', { method: 'DELETE' }),
  pets: () => request<Pet[]>('/catmate/pets'),
  route: (trackerId: string, timer: number) => request<Rute>(`/catmate/trackers/${encodeURIComponent(trackerId)}/route?timer=${timer}`),
}

/** Unix-sekunder → "lige nu", "for 12 min. siden", "for 3 timer siden", "for 2 dage siden". */
export function sidenTekst(time: number, nu = Date.now()): string {
  const min = Math.max(0, Math.round((nu / 1000 - time) / 60))
  if (min < 1) return 'lige nu'
  if (min < 60) return `for ${min} min. siden`
  const timer = Math.round(min / 60)
  if (timer < 24) return `for ${timer} ${timer === 1 ? 'time' : 'timer'} siden`
  const dage = Math.round(timer / 24)
  return `for ${dage} ${dage === 1 ? 'dag' : 'dage'} siden`
}

const tid = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** Unix-sekunder → "9. nov. 14.32" */
export const tidspunkt = (time: number) => tid.format(new Date(time * 1000))

const km = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** 840 → "840 m", 2340 → "2,3 km" */
export const afstand = (meter: number) => (meter < 1000 ? `${Math.round(meter)} m` : `${km.format(meter / 1000)} km`)
