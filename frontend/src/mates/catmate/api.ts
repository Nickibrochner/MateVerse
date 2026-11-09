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

export interface Hjem { lat: number; lng: number; radius: number }

export interface CatMateSettings {
  email: string | null
  forbundet: boolean
  hjem: Hjem | null
}

export interface Spurt { time: number; top_kmt: number; lat: number; lng: number }
export interface HjemmeUde { hjemme_min: number; ude_min: number; hjemme_pct: number | null }
export interface Hotspot { lat: number; lng: number; minutter: number; besøg: number; afstand_hjem_m: number | null }

/** Tractives egne aktivitets- og søvntal for én dag. */
export interface Dag {
  dato: string
  aktiv_min: number | null
  hvile_min: number | null
  maal_min: number | null
  dagsoevn_min: number | null
  natsoevn_min: number | null
  kalorier: number | null
}

export interface Indsigt {
  navn: string
  hjem: Hjem | null
  rute_fejl: string | null
  i_dag: { dato: string; afstand_m: number; spurter: Spurt[]; hjemme: HjemmeUde | null }
  uge: {
    punkter: number
    fra: number | null
    afstand_m: number
    spurter: Spurt[]
    territorium: { areal_m2: number; omrids: { lat: number; lng: number }[] }
    hotspots: Hotspot[]
    hjemme: HjemmeUde | null
    /** Tilbagelagte meter pr. time på døgnet (0–23). */
    meter_pr_time: number[]
    natteravn: { score: number | null; label: string }
  }
  batteri: {
    niveau: number | null
    lader: boolean | null
    prognose: { pct_pr_døgn: number; tom_time: number; timer_tilbage: number } | null
  }
  sundhed: {
    /** Sat, hvis Tractive ikke leverede aktivitetstallene. */
    fejl: string | null
    i_dag: Dag | null
    streak: number
    dage: (Dag & { maal_naaet: boolean })[]
  }
}

export const catApi = {
  settings: () => request<CatMateSettings>('/catmate/settings'),
  connect: (email: string, password: string) => request<CatMateSettings>('/catmate/settings', json('PUT', { email, password })),
  disconnect: () => request<CatMateSettings>('/catmate/settings', { method: 'DELETE' }),
  setHjem: (hjem: Hjem) => request<CatMateSettings>('/catmate/hjem', json('PUT', hjem)),
  indsigt: (trackerId: string) => request<Indsigt>(`/catmate/trackers/${encodeURIComponent(trackerId)}/indsigt`),
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

/** 135 → "2 t 15 min", 40 → "40 min" */
export const varighed = (minutter: number) =>
  minutter < 60 ? `${Math.round(minutter)} min` : `${Math.floor(minutter / 60)} t ${Math.round(minutter % 60)} min`

const ha = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 })
const m2 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 })
/** 7100 → "7.100 m²", 23500 → "2,35 ha" */
export const areal = (kvm: number) => (kvm < 10_000 ? `${m2.format(kvm)} m²` : `${ha.format(kvm / 10_000)} ha`)
