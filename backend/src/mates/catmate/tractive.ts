import { db } from '../../db'
import { lokalTid, type BatteriMåling, type Dag, type Hjem } from './analyse'
import type { Point } from './geo'

/**
 * Klient til Tractives API (graph.tractive.com). API'et er ikke officielt dokumenteret – det er
 * det samme, som Tractives egen app og Home Assistant-integrationen (aiotractive) bruger – så
 * alle svar læses tolerant: mangler et felt, bliver det til null i stedet for en fejl.
 *
 * CatMate læser kun. Der sendes ingen kommandoer til trackeren (live-tracking, lys, lyd).
 */

const API = 'https://graph.tractive.com/4'
/** Tractives "wellness"-tjeneste med dagens aktivitets- og søvntal. */
const APS = 'https://aps-api.tractive.com/api/1'
/** Klient-id'et, som Home Assistant-integrationen bruger. Tractive kræver et i hver forespørgsel. */
const CLIENT_ID = '625e533dc3c3b41c28a669f0'
const TIMEOUT = 10_000

export class TractiveError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ── Indstillinger (login og token) ─────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = db.query('SELECT value FROM catmate_setting WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function saveSetting(key: string, value: string) {
  db.query(
    `INSERT INTO catmate_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

interface Session {
  user_id: string
  access_token: string
  /** Unix-sekunder. */
  expires_at: number
}

function gemtSession(): Session | null {
  try {
    const s = JSON.parse(getSetting('session') ?? 'null') as Session | null
    // Fornyes et døgn før udløb, så et token ikke udløber midt i en række kald.
    return s && s.expires_at - 86_400 > Date.now() / 1000 ? s : null
  } catch {
    return null
  }
}

export const erForbundet = () => !!getSetting('email') && !!getSetting('password')

/** Hjemmepunktet er kattens, ikke Tractive-kontoens – det overlever, at forbindelsen afbrydes. */
export function getHjem(): Hjem | null {
  try {
    const h = JSON.parse(getSetting('hjem') ?? 'null')
    return h && typeof h.lat === 'number' && typeof h.lng === 'number' && typeof h.radius === 'number' ? h : null
  } catch {
    return null
  }
}

export function afbryd() {
  db.exec("DELETE FROM catmate_setting WHERE key != 'hjem'")
  cache.clear()
}

// ── HTTP ───────────────────────────────────────────────────────────────────────

/** Kan udskiftes i tests. */
export const net = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }

async function kald(path: string, init: RequestInit = {}): Promise<any> {
  let res: Response
  try {
    res = await net.fetch(path.startsWith('https://') ? path : `${API}${path}`, {
      ...init,
      headers: { 'X-Tractive-Client': CLIENT_ID, Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch {
    throw new TractiveError(0, 'Kan ikke få forbindelse til Tractive')
  }
  if (!res.ok) {
    throw new TractiveError(res.status, res.status === 401 || res.status === 403
      ? 'Tractive afviste login – tjek email og adgangskode'
      : res.status === 429 ? 'Tractive begrænser antallet af forespørgsler – prøv igen om lidt'
      : `Tractive svarede ${res.status}`)
  }
  return res.json().catch(() => null)
}

/** Logger ind og gemmer tokenet. Kaster TractiveError(401), hvis login er forkert. */
export async function login(email: string, password: string): Promise<Session> {
  const json = await kald('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ platform_email: email, platform_token: password, grant_type: 'tractive' }),
  })
  if (!json?.access_token || !json?.user_id) throw new TractiveError(502, 'Uventet svar fra Tractive ved login')
  const session: Session = {
    user_id: json.user_id,
    access_token: json.access_token,
    expires_at: Number(json.expires_at) || Math.floor(Date.now() / 1000) + 86_400,
  }
  saveSetting('session', JSON.stringify(session))
  return session
}

/** Et login, der er i gang. Oversigten sender flere kald på én gang, og de skal dele det samme login. */
let igangværende: Promise<Session> | null = null

async function session(): Promise<Session> {
  const gemt = gemtSession()
  if (gemt) return gemt
  const email = getSetting('email')
  const password = getSetting('password')
  if (!email || !password) throw new TractiveError(409, 'Tractive er ikke forbundet – log ind under Indstillinger')
  igangværende ??= login(email, password).finally(() => { igangværende = null })
  return igangværende
}

async function hent(path: string | ((s: Session) => string)): Promise<any> {
  const forsøg = (s: Session) =>
    kald(typeof path === 'string' ? path : path(s), {
      headers: { Authorization: `Bearer ${s.access_token}`, 'X-Tractive-User': s.user_id },
    })
  const brugt = await session()
  try {
    return await forsøg(brugt)
  } catch (e) {
    // Tokenet kan være trukket tilbage før tid: log ind én gang til, og prøv igen.
    if (!(e instanceof TractiveError) || e.status !== 401) throw e
    // Slet kun det token, der blev afvist – et parallelt kald kan allerede have hentet et nyt.
    if (gemtSession()?.access_token === brugt.access_token) {
      db.query("DELETE FROM catmate_setting WHERE key = 'session'").run()
    }
    return forsøg(await session())
  }
}

/** Et delkald, der gerne må mangle (fx ingen position endnu) uden at vælte hele oversigten. */
const valgfri = (path: string) => hent(path).catch(() => null)

// ── Data ───────────────────────────────────────────────────────────────────────

export interface Pet {
  tracker_id: string
  /** Tractives id for selve dyret (aktivitetstallene hører til dyret, ikke trackeren). */
  pet_id: string | null
  navn: string
  /** 'CAT', 'DOG' … som Tractive kalder det, eller null. */
  art: string | null
  model: string | null
  /** 0–100, eller null hvis trackeren ikke har meldt ind. */
  batteri: number | null
  lader: boolean | null
  /** Tractives egen tilstand, fx 'OPERATIONAL'. */
  tilstand: string | null
  /** Unix-sekunder for trackerens seneste statusmelding. */
  status_time: number | null
  position: Point | null
}

const tal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const tekst = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Tractives positionsformat ({ time, latlong: [lat, lng], … }) → Point, eller null hvis ubrugeligt. */
export function tilPoint(raw: any): Point | null {
  const time = tal(raw?.time)
  const lat = tal(raw?.latlong?.[0])
  const lng = tal(raw?.latlong?.[1])
  if (time == null || lat == null || lng == null) return null
  return {
    time, lat, lng,
    speed: tal(raw.speed),
    altitude: tal(raw.altitude ?? raw.alt),
    uncertainty: tal(raw.pos_uncertainty),
    sensor: tekst(raw.sensor_used),
  }
}

const gemPunkt = db.query(
  `INSERT OR IGNORE INTO catmate_position (tracker_id, time, lat, lng, speed, altitude, uncertainty, sensor)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
)
const gemPunkter = db.transaction((trackerId: string, points: Point[]) => {
  for (const p of points) gemPunkt.run(trackerId, p.time, p.lat, p.lng, p.speed, p.altitude, p.uncertainty, p.sensor)
})

const gemBatteri = db.query('INSERT OR IGNORE INTO catmate_battery (tracker_id, time, level, charging) VALUES (?, ?, ?, ?)')

/** Korte caches, så hub-kortet og kortsiden ikke hver især spørger Tractive. */
const cache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}
export const tømCache = () => cache.clear()

/** Alle kontoens trackere med kæledyrets navn, batteri og seneste position. */
export const hentPets = (): Promise<Pet[]> => cached('pets', 30_000, async () => {
  const [trackere, dyr] = await Promise.all([
    hent(s => `/user/${s.user_id}/trackers`),
    hent(s => `/user/${s.user_id}/trackable_objects`).catch(() => []),
  ])
  const detaljer: any[] = await Promise.all((Array.isArray(dyr) ? dyr : []).map(d => valgfri(`/trackable_object/${d._id}`)))

  return Promise.all((Array.isArray(trackere) ? trackere : []).map(async (t: any): Promise<Pet> => {
    const id = String(t._id)
    const [tracker, hw, pos] = await Promise.all([
      valgfri(`/tracker/${id}`), valgfri(`/device_hw_report/${id}/`), valgfri(`/device_pos_report/${id}`),
    ])
    const ejer = detaljer.find(d => d?.device_id === id)
    const position = tilPoint(pos)
    if (position) gemPunkter(id, [position])
    const batteri = tal(hw?.battery_level)
    const lader = typeof tracker?.charging_state === 'string' ? tracker.charging_state === 'CHARGING' : null
    // Målingen stemples med trackerens egen tid, så samme rapport ikke gemmes to gange.
    if (batteri != null) gemBatteri.run(id, tal(hw?.time) ?? Math.floor(Date.now() / 1000), Math.round(batteri), lader ? 1 : 0)
    return {
      tracker_id: id,
      pet_id: tekst(ejer?._id),
      navn: tekst(ejer?.details?.name) ?? `Tracker ${id}`,
      art: tekst(ejer?.details?.pet_type),
      model: tekst(tracker?.model_number),
      batteri,
      lader,
      tilstand: tekst(tracker?.state),
      status_time: tal(hw?.time),
      position,
    }
  }))
})

export interface Rute {
  points: Point[]
  /** 'live' = lige synkroniseret med Tractive, 'cache' = kun de lokalt gemte punkter. */
  kilde: 'live' | 'cache'
  fejl: string | null
}

/**
 * Rute for de seneste `timer` timer. Punkterne hentes fra Tractive og lægges i den lokale tabel,
 * og svaret læses derfra – så virker siden også, når Tractive ikke svarer, og historikken
 * rækker længere tilbage end Tractive selv gemmer, når først den er hentet.
 */
export async function hentRute(trackerId: string, timer: number): Promise<Rute> {
  const til = Math.floor(Date.now() / 1000)
  const fra = til - Math.round(timer * 3600)
  let fejl: string | null = null
  try {
    await cached(`rute:${trackerId}:${timer}`, 60_000, async () => {
      const json = await hent(`/tracker/${trackerId}/positions?time_from=${fra}&time_to=${til}&format=json_segments`)
      // json_segments er en liste af segmenter, som hver er en liste af punkter.
      const points = (Array.isArray(json) ? json.flat(2) : []).map(tilPoint).filter((p): p is Point => !!p)
      gemPunkter(trackerId, points)
      return true
    })
  } catch (e) {
    fejl = (e as Error).message
  }
  const points = db
    .query(
      `SELECT time, lat, lng, speed, altitude, uncertainty, sensor FROM catmate_position
       WHERE tracker_id = ? AND time >= ? ORDER BY time`,
    )
    .all(trackerId, fra) as Point[]
  return { points, kilde: fejl ? 'cache' : 'live', fejl }
}

export function batteriMålinger(trackerId: string, fra: number): BatteriMåling[] {
  const rows = db
    .query('SELECT time, level, charging FROM catmate_battery WHERE tracker_id = ? AND time >= ? ORDER BY time')
    .all(trackerId, fra) as { time: number; level: number; charging: number }[]
  return rows.map(r => ({ ...r, charging: !!r.charging }))
}

// ── Aktivitet og søvn ──────────────────────────────────────────────────────────

/**
 * Tractives sundhedsoversigt ({ activity: { minutesActive, minutesGoal, minutesRest, calories },
 * sleep: { minutesDaySleep, minutesNightSleep } }) → dagens række. Feltnavnene er dem, Home
 * Assistant-integrationen læser; mangler de alle, er svaret ikke en oversigt, og der returneres null.
 */
export function tilDag(raw: any, dato: string): Dag | null {
  const a = raw?.activity ?? {}
  const s = raw?.sleep ?? {}
  const dag: Dag = {
    dato,
    aktiv_min: tal(a.minutesActive),
    hvile_min: tal(a.minutesRest),
    maal_min: tal(a.minutesGoal),
    dagsoevn_min: tal(s.minutesDaySleep),
    natsoevn_min: tal(s.minutesNightSleep),
    kalorier: tal(a.calories),
  }
  const { dato: _dato, ...talfelter } = dag
  return Object.values(talfelter).some(v => v != null) ? dag : null
}

const gemDag = db.query(
  `INSERT INTO catmate_day (tracker_id, dato, aktiv_min, hvile_min, maal_min, dagsoevn_min, natsoevn_min, kalorier, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(tracker_id, dato) DO UPDATE SET
     aktiv_min = excluded.aktiv_min, hvile_min = excluded.hvile_min, maal_min = excluded.maal_min,
     dagsoevn_min = excluded.dagsoevn_min, natsoevn_min = excluded.natsoevn_min, kalorier = excluded.kalorier,
     updated_at = excluded.updated_at`,
)

/**
 * Henter dagens aktivitets- og søvntal og gemmer dem som dagens række. Tallene vokser i løbet af
 * dagen, så rækken overskrives ved hvert kald, og den sidste hentning før midnat bliver dagens resultat.
 * Returnerer en fejlbesked, hvis Tractive ikke leverer tallene (fx uden abonnement, der dækker dem).
 */
export async function synkSundhed(pet: Pet): Promise<string | null> {
  if (!pet.pet_id) return 'Trackeren er ikke knyttet til et kæledyr hos Tractive'
  try {
    return await cached(`sundhed:${pet.pet_id}`, 5 * 60_000, async () => {
      const nu = Math.floor(Date.now() / 1000)
      const dag = tilDag(await hent(`${APS}/pet/${pet.pet_id}/health/overview`), lokalTid(nu).dato)
      if (!dag) return 'Tractive svarede uden aktivitetstal'
      gemDag.run(pet.tracker_id, dag.dato, dag.aktiv_min, dag.hvile_min, dag.maal_min, dag.dagsoevn_min, dag.natsoevn_min, dag.kalorier, nu)
      return null
    })
  } catch (e) {
    return (e as Error).message
  }
}

export function dage(trackerId: string, fraDato: string): Dag[] {
  return db
    .query(
      `SELECT dato, aktiv_min, hvile_min, maal_min, dagsoevn_min, natsoevn_min, kalorier FROM catmate_day
       WHERE tracker_id = ? AND dato >= ? ORDER BY dato`,
    )
    .all(trackerId, fraDato) as Dag[]
}

// ── Baggrundshentning ──────────────────────────────────────────────────────────

/**
 * Henter position, batteri, rute og aktivitetstal for alle trackere. Kaldes af poller.ts hvert
 * femte minut, så historikken også bygges op, når ingen har siden åben. Fejl sluges: næste runde prøver igen.
 */
export async function synkAlt(): Promise<void> {
  if (!erForbundet()) return
  cache.delete('pets')
  const pets = await hentPets()
  for (const pet of pets) {
    await hentRute(pet.tracker_id, 24)
    await synkSundhed(pet)
  }
}
