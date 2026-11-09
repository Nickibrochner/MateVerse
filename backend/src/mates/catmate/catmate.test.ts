import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Testene kører mod en tom database i en midlertidig mappe – og aldrig mod det rigtige Tractive.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'catmate-')), 'test.sqlite')

let geo: typeof import('./geo')
let tractive: typeof import('./tractive')
let db: typeof import('../../db').db

/** Falsk Tractive: sti (uden query) → svar. Alle kald logges. */
let svar: Record<string, (init?: RequestInit) => unknown>
let kald: { path: string; init?: RequestInit }[]
let logins = 0

const NU = Math.floor(Date.now() / 1000)

beforeAll(async () => {
  geo = await import('./geo')
  tractive = await import('./tractive')
  ;({ db } = await import('../../db'))
  tractive.net.fetch = async (url, init) => {
    const path = url.replace('https://graph.tractive.com/4', '')
    kald.push({ path, init })
    const handler = svar[path.split('?')[0]]
    if (!handler) return new Response('{}', { status: 404 })
    const body = handler(init)
    return body instanceof Response ? body : Response.json(body)
  }
})

beforeEach(() => {
  tractive.afbryd()
  db.exec('DELETE FROM catmate_position; DELETE FROM catmate_battery; DELETE FROM catmate_day; DELETE FROM catmate_setting')
  kald = []
  logins = 0
  svar = {
    '/auth/token': init => {
      logins++
      const body = JSON.parse(String(init?.body))
      if (body.platform_token !== 'hemmelig') return new Response('{}', { status: 401 })
      return { user_id: 'u1', access_token: `token${logins}`, expires_at: NU + 7 * 86_400 }
    },
    '/user/u1/trackers': () => [{ _id: 'TRK1', _type: 'tracker' }],
    '/user/u1/trackable_objects': () => [{ _id: 'pet1', _type: 'pet' }],
    '/trackable_object/pet1': () => ({ _id: 'pet1', device_id: 'TRK1', details: { name: 'Mis', pet_type: 'CAT' } }),
    '/tracker/TRK1': () => ({ _id: 'TRK1', model_number: 'TG4410', state: 'OPERATIONAL', charging_state: 'NOT_CHARGING' }),
    '/device_hw_report/TRK1/': () => ({ time: NU - 60, battery_level: 73 }),
    '/device_pos_report/TRK1': () => ({ time: NU - 120, latlong: [55.6761, 12.5683], pos_uncertainty: 8, speed: 0.4, altitude: 12, sensor_used: 'GPS' }),
    '/tracker/TRK1/positions': () => [[
      { time: NU - 3600, latlong: [55.6761, 12.5683], alt: 10, speed: 1, pos_uncertainty: 5, sensor_used: 'GPS' },
      { time: NU - 1800, latlong: [55.6771, 12.5683], alt: 11, speed: 1, pos_uncertainty: 5, sensor_used: 'GPS' },
      { time: NU - 900, latlong: [null, null] },
    ]],
  }
})

const forbind = () => {
  tractive.saveSetting('email', 'kat@example.com')
  tractive.saveSetting('password', 'hemmelig')
}

describe('geometri', () => {
  test('distance: en breddegrad er ca. 111 km', () => {
    expect(geo.distance({ lat: 55, lng: 12 }, { lat: 56, lng: 12 })).toBeCloseTo(111_195, -2)
    expect(geo.distance({ lat: 55, lng: 12 }, { lat: 55, lng: 12 })).toBe(0)
  })

  const p = (time: number, lat: number, lng = 12, uncertainty: number | null = null) =>
    ({ time, lat, lng, speed: null, altitude: null, uncertainty, sensor: null })

  test('ruteStat: tom rute', () => {
    expect(geo.ruteStat([])).toEqual({ punkter: 0, afstand_m: 0, max_fra_start_m: 0, fra: null, til: null })
  })

  test('ruteStat: GPS-støj fra en kat, der ligger stille, tæller ikke som afstand', () => {
    // 0,00005° breddegrad ≈ 5,5 m – under støjgrænsen
    const stille = Array.from({ length: 20 }, (_, i) => p(i, 55 + (i % 2) * 0.00005))
    expect(geo.ruteStat(stille).afstand_m).toBe(0)
  })

  test('ruteStat: ud og hjem tæller begge veje, og max er luftlinje fra start', () => {
    // 0,001° ≈ 111 m
    const stat = geo.ruteStat([p(1, 55), p(2, 55.001), p(3, 55.002), p(4, 55.001), p(5, 55)])
    expect(stat.afstand_m).toBeGreaterThan(440)
    expect(stat.afstand_m).toBeLessThan(450)
    expect(stat.max_fra_start_m).toBeGreaterThan(220)
    expect(stat.max_fra_start_m).toBeLessThan(225)
    expect(stat).toMatchObject({ punkter: 5, fra: 1, til: 5 })
  })

  test('ruteStat: et punkt med stor usikkerhed skal flytte sig længere end usikkerheden for at tælle', () => {
    expect(geo.ruteStat([p(1, 55), p(2, 55.0005, 12, 100)]).afstand_m).toBe(0) // ≈ 56 m, usikkerhed 100 m
    expect(geo.ruteStat([p(1, 55), p(2, 55.0005, 12, 20)]).afstand_m).toBeGreaterThan(50)
  })
})

describe('tilPoint', () => {
  test('læser Tractives format og tåler manglende felter', () => {
    expect(tractive.tilPoint({ time: 5, latlong: [55.1, 12.2], alt: 7 })).toEqual({
      time: 5, lat: 55.1, lng: 12.2, speed: null, altitude: 7, uncertainty: null, sensor: null,
    })
    expect(tractive.tilPoint({ time: 5 })).toBeNull()
    expect(tractive.tilPoint({ latlong: [1, 2] })).toBeNull()
    expect(tractive.tilPoint(null)).toBeNull()
  })
})

describe('Tractive-klient', () => {
  test('ikke forbundet: fejler uden at kalde Tractive', async () => {
    await expect(tractive.hentPets()).rejects.toThrow('ikke forbundet')
    expect(kald).toHaveLength(0)
  })

  test('forkert adgangskode giver en forståelig fejl', async () => {
    await expect(tractive.login('kat@example.com', 'forkert')).rejects.toThrow('afviste login')
    expect(tractive.getSetting('session')).toBeNull()
  })

  test('hentPets: samler navn, batteri og position, og gemmer positionen lokalt', async () => {
    forbind()
    const pets = await tractive.hentPets()
    expect(pets).toEqual([{
      tracker_id: 'TRK1', pet_id: 'pet1', navn: 'Mis', art: 'CAT', model: 'TG4410', batteri: 73, lader: false,
      tilstand: 'OPERATIONAL', status_time: NU - 60,
      position: { time: NU - 120, lat: 55.6761, lng: 12.5683, speed: 0.4, altitude: 12, uncertainty: 8, sensor: 'GPS' },
    }])
    expect(db.query('SELECT COUNT(*) AS n FROM catmate_position').get()).toEqual({ n: 1 })

    const medToken = kald.find(k => k.path === '/user/u1/trackers')!
    expect((medToken.init!.headers as Record<string, string>).Authorization).toBe('Bearer token1')
  })

  test('hentPets: caches, og login genbruges mellem kald', async () => {
    forbind()
    await tractive.hentPets()
    const efterFørste = kald.length
    await tractive.hentPets()
    expect(kald.length).toBe(efterFørste)

    tractive.tømCache()
    await tractive.hentPets()
    expect(logins).toBe(1)
  })

  test('hentPets: en tracker uden kæledyr, hardware- eller positionsrapport vælter ikke oversigten', async () => {
    forbind()
    svar['/user/u1/trackable_objects'] = () => []
    delete svar['/device_hw_report/TRK1/']
    delete svar['/device_pos_report/TRK1']
    const [pet] = await tractive.hentPets()
    expect(pet).toMatchObject({ navn: 'Tracker TRK1', art: null, batteri: null, position: null })
  })

  test('et token, Tractive har trukket tilbage, fornyes med ét nyt login', async () => {
    forbind()
    await tractive.hentPets()
    tractive.tømCache()
    const trackers = svar['/user/u1/trackers']
    svar['/user/u1/trackers'] = init =>
      (init!.headers as Record<string, string>).Authorization === 'Bearer token1' ? new Response('{}', { status: 401 }) : trackers()
    const pets = await tractive.hentPets()
    expect(pets).toHaveLength(1)
    expect(logins).toBe(2)
  })

  test('hentRute: gemmer punkter lokalt, springer ugyldige over og er idempotent', async () => {
    forbind()
    const rute = await tractive.hentRute('TRK1', 24)
    expect(rute.kilde).toBe('live')
    expect(rute.points.map(p => p.time)).toEqual([NU - 3600, NU - 1800])
    expect(rute.points[0].altitude).toBe(10)

    tractive.tømCache()
    await tractive.hentRute('TRK1', 24)
    expect(db.query('SELECT COUNT(*) AS n FROM catmate_position').get()).toEqual({ n: 2 })
  })

  test('hentRute: perioden afgrænser de lokale punkter', async () => {
    forbind()
    await tractive.hentRute('TRK1', 24)
    tractive.tømCache()
    // 0,75 time tilbage: kun punktet fra for en halv time siden er med
    expect((await tractive.hentRute('TRK1', 0.75)).points.map(p => p.time)).toEqual([NU - 1800])
  })

  test('hentRute: svarer Tractive ikke, vises de gemte punkter med en fejlbesked', async () => {
    forbind()
    await tractive.hentRute('TRK1', 24)
    tractive.tømCache()
    svar['/tracker/TRK1/positions'] = () => new Response('{}', { status: 500 })
    const rute = await tractive.hentRute('TRK1', 24)
    expect(rute.kilde).toBe('cache')
    expect(rute.fejl).toBe('Tractive svarede 500')
    expect(rute.points).toHaveLength(2)
  })

  test('batteriet gemmes én gang pr. rapport fra trackeren', async () => {
    forbind()
    await tractive.hentPets()
    tractive.tømCache()
    await tractive.hentPets()
    expect(tractive.batteriMålinger('TRK1', 0)).toEqual([{ time: NU - 60, level: 73, charging: false }])
  })

  test('synkSundhed: dagens aktivitetstal gemmes og overskrives i løbet af dagen', async () => {
    forbind()
    const [pet] = await tractive.hentPets()
    const overblik = { activity: { minutesActive: 40, minutesGoal: 60, minutesRest: 300, calories: 120 }, sleep: { minutesDaySleep: 200, minutesNightSleep: 380 } }
    svar['https://aps-api.tractive.com/api/1/pet/pet1/health/overview'] = () => overblik
    expect(await tractive.synkSundhed(pet)).toBeNull()

    overblik.activity.minutesActive = 75
    tractive.tømCache()
    await tractive.synkSundhed(pet)
    const rækker = tractive.dage('TRK1', '2000-01-01')
    expect(rækker).toHaveLength(1)
    expect(rækker[0]).toMatchObject({ aktiv_min: 75, maal_min: 60, hvile_min: 300, dagsoevn_min: 200, natsoevn_min: 380, kalorier: 120 })
  })

  test('synkSundhed: leverer Tractive ikke tallene, gives en besked i stedet for en fejl', async () => {
    forbind()
    const [pet] = await tractive.hentPets()
    expect(await tractive.synkSundhed(pet)).toBe('Tractive svarede 404')
    tractive.tømCache()
    svar['https://aps-api.tractive.com/api/1/pet/pet1/health/overview'] = () => ({ noget: 'andet' })
    expect(await tractive.synkSundhed(pet)).toBe('Tractive svarede uden aktivitetstal')
    expect(tractive.dage('TRK1', '2000-01-01')).toEqual([])
  })

  test('hjemmepunktet overlever, at forbindelsen afbrydes', () => {
    forbind()
    tractive.saveSetting('hjem', JSON.stringify({ lat: 55.6, lng: 12.5, radius: 50 }))
    tractive.afbryd()
    expect(tractive.getHjem()).toEqual({ lat: 55.6, lng: 12.5, radius: 50 })
    tractive.saveSetting('hjem', 'ikke json')
    expect(tractive.getHjem()).toBeNull()
  })

  test('afbryd fjerner login og token', async () => {
    forbind()
    await tractive.hentPets()
    tractive.afbryd()
    expect(tractive.erForbundet()).toBe(false)
    expect(tractive.getSetting('session')).toBeNull()
  })
})
