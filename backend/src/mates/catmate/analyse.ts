import { STØJ_METER, distance, type Point } from './geo'

/**
 * CatMates indsigter: alt det, der kan regnes ud af de gemte positioner, batterimålinger og
 * Tractives daglige aktivitetstal. Rene funktioner uden database eller net.
 *
 * Tallene er skøn. Trackeren melder kun position med minutters mellemrum (og sjældnere, når katten
 * ligger stille eller er i en strømsparezone), så alt mellem to målinger er et gæt.
 */

export interface LatLng { lat: number; lng: number }
export interface Hjem extends LatLng { radius: number }

// ── Tid ────────────────────────────────────────────────────────────────────────

/** Backenden kører typisk i UTC i Docker, men "i dag" og "om natten" skal følge kattens ur. */
export const TIDSZONE = process.env.CATMATE_TZ ?? 'Europe/Copenhagen'

const lokalFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIDSZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})

/** Unix-sekunder → lokal dato (YYYY-MM-DD) og time (0–23). */
export function lokalTid(time: number): { dato: string; time: number } {
  const dele = Object.fromEntries(lokalFormat.formatToParts(new Date(time * 1000)).map(d => [d.type, d.value]))
  return { dato: `${dele.year}-${dele.month}-${dele.day}`, time: Number(dele.hour) }
}

/** Nat er 22–06, samme skel som Tractive-appen bruger mellem nattesøvn og dagsøvn. */
export const erNat = (time: number) => time >= 22 || time < 6

// ── Bevægelse ──────────────────────────────────────────────────────────────────

export interface Skridt { fra: Point; til: Point; meter: number }

/** Rutens rigtige flytninger – samme støjfilter som ruteStat, så tallene stemmer overens. */
export function skridt(points: Point[]): Skridt[] {
  const ud: Skridt[] = []
  let anker = points[0]
  for (const p of points) {
    const meter = distance(anker, p)
    if (meter >= Math.max(STØJ_METER, p.uncertainty ?? 0)) {
      ud.push({ fra: anker, til: p, meter })
      anker = p
    }
  }
  return ud
}

/** Tilbagelagte meter fordelt på døgnets 24 timer (lokal tid). Skridtet tælles i den time, det sluttede. */
export function meterPrTime(points: Point[]): number[] {
  const timer = Array<number>(24).fill(0)
  for (const s of skridt(points)) timer[lokalTid(s.til.time).time] += s.meter
  return timer.map(Math.round)
}

export interface Natteravn {
  /** 0 = ren dagkat, 100 = bevæger sig kun om natten. null, hvis katten stort set ikke har flyttet sig. */
  score: number | null
  label: string
}

/**
 * Hvor stor en del af bevægelsen ligger om natten? Natten er 8 af døgnets 24 timer, så en kat,
 * der er lige aktiv hele døgnet, lander på 33.
 */
export function natteravn(timer: number[]): Natteravn {
  const total = timer.reduce((a, b) => a + b, 0)
  if (total < 200) return { score: null, label: 'For lidt bevægelse til at sige noget endnu' }
  const nat = timer.reduce((a, m, t) => a + (erNat(t) ? m : 0), 0)
  const score = Math.round((nat / total) * 100)
  const label = score >= 60 ? 'Natteravn – jagter mest i mørke'
    : score >= 40 ? 'Skumringsjæger – lidt mere nat end dag'
    : score >= 20 ? 'Dagdriver – mest ude i dagslys'
    : 'Sofakartoffel om natten – sover, når I sover'
  return { score, label }
}

// ── Spurter ────────────────────────────────────────────────────────────────────

/** Ca. 11 km/t. En kat går med 1–1,5 m/s; over det her løber den. */
export const SPURT_MS = 3
/** Over ca. 50 km/t er det et GPS-hop eller en biltur, ikke en kat. */
const MAX_MS = 14

export interface Spurt { time: number; top_kmt: number; lat: number; lng: number }

/**
 * Pludselige høje hastigheder. Bruger trackerens egen hastighed, når den findes, og ellers
 * afstand/tid mellem to målinger, der ligger højst to minutter fra hinanden. Hurtige målinger
 * inden for to minutter regnes som samme spurt.
 */
export function spurter(points: Point[]): Spurt[] {
  const ud: Spurt[] = []
  let sidste = -Infinity
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const forrige = points[i - 1]
    if ((p.uncertainty ?? 0) > 30) continue
    let ms = p.speed
    if (ms == null && forrige) {
      const sek = p.time - forrige.time
      if (sek > 0 && sek <= 120) ms = distance(forrige, p) / sek
    }
    if (ms == null || ms < SPURT_MS || ms > MAX_MS) continue
    const kmt = Math.round(ms * 36) / 10
    if (p.time - sidste <= 120) {
      const igang = ud[ud.length - 1]
      if (kmt > igang.top_kmt) Object.assign(igang, { top_kmt: kmt, lat: p.lat, lng: p.lng })
    } else {
      ud.push({ time: p.time, top_kmt: kmt, lat: p.lat, lng: p.lng })
    }
    sidste = p.time
  }
  return ud
}

// ── Territorium ────────────────────────────────────────────────────────────────

/** Lokal flad projektion i meter omkring et referencepunkt – præcis nok på en kats skala. */
function projektion(ref: LatLng) {
  const mLat = 111_320
  const mLng = 111_320 * Math.cos((ref.lat * Math.PI) / 180)
  return {
    til: (p: LatLng) => ({ x: (p.lng - ref.lng) * mLng, y: (p.lat - ref.lat) * mLat }),
    fra: (x: number, y: number): LatLng => ({ lat: ref.lat + y / mLat, lng: ref.lng + x / mLng }),
  }
}

export interface Territorium {
  /** Areal af det mindste konvekse område, der rummer alle positioner. */
  areal_m2: number
  /** Områdets hjørner, klar til at tegne på kortet. */
  omrids: LatLng[]
}

/** Målinger med stor usikkerhed ville puste territoriet op, så de er ikke med. */
const MAX_USIKKERHED = 50

export function territorium(points: Point[]): Territorium {
  const gode = points.filter(p => (p.uncertainty ?? 0) <= MAX_USIKKERHED)
  if (gode.length < 3) return { areal_m2: 0, omrids: [] }
  const proj = projektion(gode[0])
  const xy = gode.map(proj.til).sort((a, b) => a.x - b.x || a.y - b.y)

  // Konveks indhylning (Andrews monotone chain)
  const kryds = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const halv = (liste: typeof xy) => {
    const h: typeof xy = []
    for (const p of liste) {
      while (h.length >= 2 && kryds(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop()
      h.push(p)
    }
    h.pop()
    return h
  }
  const hylster = [...halv(xy), ...halv([...xy].reverse())]
  if (hylster.length < 3) return { areal_m2: 0, omrids: [] }

  let areal = 0
  for (let i = 0; i < hylster.length; i++) {
    const a = hylster[i], b = hylster[(i + 1) % hylster.length]
    areal += a.x * b.y - b.x * a.y
  }
  return { areal_m2: Math.round(Math.abs(areal) / 2), omrids: hylster.map(p => proj.fra(p.x, p.y)) }
}

// ── Opholdstid: hjemme/ude og favoritsteder ────────────────────────────────────

/**
 * Tiden mellem to målinger tilskrives det sted, katten var ved den første. Trackeren melder
 * sjældent ind, når katten ligger stille, så lange huller er normale – men efter seks timer
 * uden en måling er trackeren nok slukket eller til opladning, og resten tælles ikke med.
 */
const MAX_HUL_SEK = 6 * 3600

function ophold(points: Point[], til: number): { p: Point; sek: number }[] {
  return points.map((p, i) => ({ p, sek: Math.min(Math.max((points[i + 1]?.time ?? til) - p.time, 0), MAX_HUL_SEK) }))
}

export const erHjemme = (p: LatLng, hjem: Hjem) => distance(p, hjem) <= hjem.radius

export interface HjemmeUde { hjemme_min: number; ude_min: number; hjemme_pct: number | null }

export function hjemmeUde(points: Point[], hjem: Hjem, til: number): HjemmeUde {
  let hjemme = 0, ude = 0
  for (const { p, sek } of ophold(points, til)) {
    if (erHjemme(p, hjem)) hjemme += sek
    else ude += sek
  }
  const total = hjemme + ude
  return {
    hjemme_min: Math.round(hjemme / 60),
    ude_min: Math.round(ude / 60),
    hjemme_pct: total ? Math.round((hjemme / total) * 100) : null,
  }
}

export interface Hotspot extends LatLng { minutter: number; besøg: number; afstand_hjem_m: number | null }

/** Felter på ca. 30 × 30 m bruges til at finde, hvor positionerne klumper sig sammen. */
const FELT_METER = 30
/** Alt inden for denne afstand af et steds midte hører til stedet: skuret er ét sted, ikke fire felter. */
const STED_RADIUS = 45

/**
 * De steder uden for hjemmet, hvor katten har opholdt sig længst.
 *
 * 1. Positionerne lægges i et gitter, og hvert felt får den tid, katten har stået der.
 * 2. Felterne samles til steder, tungeste først: et felt tæt på et allerede fundet sted lægges
 *    ind i det. Ellers ville et sted, der ligger hen over en feltgrænse, blive talt som flere.
 * 3. Hver position tildeles sit nærmeste sted, og opholdstid og besøg tælles. Et "besøg" er en
 *    ankomst fra et andet sted, hjemmefra eller fra en tur.
 */
export function hotspots(points: Point[], hjem: Hjem | null, til: number, antal = 5): Hotspot[] {
  const brugbare = ophold(points, til).map(o => ({
    ...o, med: (o.p.uncertainty ?? 0) <= MAX_USIKKERHED && !(hjem && erHjemme(o.p, hjem)),
  }))
  const med = brugbare.filter(o => o.med)
  if (!med.length) return []

  const proj = projektion(med[0].p)
  const felter = new Map<string, { lat: number; lng: number; vægt: number }>()
  for (const { p, sek } of med) {
    const { x, y } = proj.til(p)
    const nøgle = `${Math.floor(x / FELT_METER)}:${Math.floor(y / FELT_METER)}`
    const felt = felter.get(nøgle) ?? felter.set(nøgle, { lat: 0, lng: 0, vægt: 0 }).get(nøgle)!
    // Midtpunktet vægtes med opholdstiden (mindst ét sekund, så et enkelt punkt også tæller).
    const v = Math.max(sek, 1)
    felt.lat += p.lat * v
    felt.lng += p.lng * v
    felt.vægt += v
  }

  const steder: { lat: number; lng: number; vægt: number; sek: number; besøg: number }[] = []
  for (const f of [...felter.values()].sort((a, b) => b.vægt - a.vægt)) {
    const midte = { lat: f.lat / f.vægt, lng: f.lng / f.vægt }
    const nabo = steder.find(s => distance(s, midte) <= STED_RADIUS)
    if (nabo) {
      const vægt = nabo.vægt + f.vægt
      nabo.lat = (nabo.lat * nabo.vægt + f.lat) / vægt
      nabo.lng = (nabo.lng * nabo.vægt + f.lng) / vægt
      nabo.vægt = vægt
    } else {
      steder.push({ ...midte, vægt: f.vægt, sek: 0, besøg: 0 })
    }
  }

  let forrige: (typeof steder)[number] | null = null
  for (const { p, sek, med: tæller } of brugbare) {
    let sted: (typeof steder)[number] | null = null
    if (tæller) {
      let bedst = STED_RADIUS
      for (const s of steder) {
        const d = distance(s, p)
        if (d <= bedst) {
          bedst = d
          sted = s
        }
      }
    }
    if (sted) {
      sted.sek += sek
      if (sted !== forrige) sted.besøg++
    }
    forrige = sted
  }

  return steder
    .filter(s => s.sek >= 600)
    .sort((a, b) => b.sek - a.sek)
    .slice(0, antal)
    .map(s => ({
      lat: s.lat, lng: s.lng, minutter: Math.round(s.sek / 60), besøg: s.besøg,
      afstand_hjem_m: hjem ? Math.round(distance(s, hjem)) : null,
    }))
}

// ── Batteri ────────────────────────────────────────────────────────────────────

export interface BatteriMåling { time: number; level: number; charging: boolean }

export interface BatteriPrognose {
  /** Procentpoint pr. døgn ved det nuværende forbrug. */
  pct_pr_døgn: number
  /** Unix-sekunder, hvor batteriet ventes at være tomt. */
  tom_time: number
  timer_tilbage: number
}

/**
 * Hvornår løber batteriet tør? Regnes på forbruget siden seneste opladning: fra første til
 * seneste måling i den nuværende afladning. Kræver mindst to timers målinger og to procentpoints
 * fald, ellers er tallet rent gætværk – så returneres null.
 */
export function batteriPrognose(målinger: BatteriMåling[]): BatteriPrognose | null {
  if (målinger.length < 2) return null
  const sidste = målinger[målinger.length - 1]
  if (sidste.charging) return null
  // Gå baglæns til seneste opladning: en måling under opladning eller et hop opad.
  let start = målinger.length - 1
  while (start > 0 && !målinger[start - 1].charging && målinger[start - 1].level >= målinger[start].level) start--
  const første = målinger[start]
  const timer = (sidste.time - første.time) / 3600
  const fald = første.level - sidste.level
  if (timer < 2 || fald < 2) return null
  const prTime = fald / timer
  const timerTilbage = sidste.level / prTime
  return {
    pct_pr_døgn: Math.round(prTime * 24 * 10) / 10,
    tom_time: Math.round(sidste.time + timerTilbage * 3600),
    timer_tilbage: Math.round(timerTilbage),
  }
}

// ── Aktivitetsmål ──────────────────────────────────────────────────────────────

export interface Dag {
  dato: string
  aktiv_min: number | null
  hvile_min: number | null
  maal_min: number | null
  dagsoevn_min: number | null
  natsoevn_min: number | null
  kalorier: number | null
}

export const måletNået = (d: Dag) => d.aktiv_min != null && d.maal_min != null && d.maal_min > 0 && d.aktiv_min >= d.maal_min

const dagenFør = (dato: string) => new Date(Date.parse(`${dato}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * Antal dage i træk, hvor aktivitetsmålet er nået. Dagen i dag tæller med, hvis målet allerede er
 * nået, men bryder ikke rækken, hvis den ikke er – dagen er jo ikke slut. En dag uden data bryder rækken.
 */
export function streak(dage: Dag[], iDag: string): number {
  const pr = new Map(dage.map(d => [d.dato, d]))
  let n = 0
  let dato = iDag
  const dagens = pr.get(iDag)
  if (!dagens || !måletNået(dagens)) dato = dagenFør(iDag)
  for (let d = pr.get(dato); d && måletNået(d); d = pr.get(dato)) {
    n++
    dato = dagenFør(dato)
  }
  return n
}
