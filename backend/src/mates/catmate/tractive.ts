import { db } from '../../db'
import type { Point } from './geo'

/**
 * Klient til Tractives API (graph.tractive.com). API'et er ikke officielt dokumenteret – det er
 * det samme, som Tractives egen app og Home Assistant-integrationen (aiotractive) bruger – så
 * alle svar læses tolerant: mangler et felt, bliver det til null i stedet for en fejl.
 *
 * CatMate læser kun. Der sendes ingen kommandoer til trackeren (live-tracking, lys, lyd).
 */

const API = 'https://graph.tractive.com/4'
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

export function afbryd() {
  db.exec('DELETE FROM catmate_setting')
  cache.clear()
}

// ── HTTP ───────────────────────────────────────────────────────────────────────

/** Kan udskiftes i tests. */
export const net = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }

async function kald(path: string, init: RequestInit = {}): Promise<any> {
  let res: Response
  try {
    res = await net.fetch(`${API}${path}`, {
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
    return {
      tracker_id: id,
      navn: tekst(ejer?.details?.name) ?? `Tracker ${id}`,
      art: tekst(ejer?.details?.pet_type),
      model: tekst(tracker?.model_number),
      batteri: tal(hw?.battery_level),
      lader: typeof tracker?.charging_state === 'string' ? tracker.charging_state === 'CHARGING' : null,
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
