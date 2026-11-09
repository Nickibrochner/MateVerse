import { describe, expect, test } from 'bun:test'
import {
  batteriPrognose, hjemmeUde, hotspots, lokalTid, meterPrTime, natteravn, spurter, streak, territorium, type Dag,
} from './analyse'
import type { Point } from './geo'

// 0,001° breddegrad ≈ 111 m. Ved 55° N er 0,001° længdegrad ≈ 64 m.
const p = (time: number, lat: number, lng = 12, ekstra: Partial<Point> = {}): Point =>
  ({ time, lat, lng, speed: null, altitude: null, uncertainty: null, sensor: null, ...ekstra })

/** Unix-sekunder for et dansk klokkeslæt en vinterdag (UTC+1). */
const kl = (time: number, minut = 0, dag = 15) => Date.UTC(2026, 0, dag, time - 1, minut) / 1000

describe('lokal tid', () => {
  test('følger dansk tid, også hen over midnat og sommertid', () => {
    expect(lokalTid(Date.UTC(2026, 0, 15, 23, 30) / 1000)).toEqual({ dato: '2026-01-16', time: 0 })
    expect(lokalTid(Date.UTC(2026, 6, 15, 21, 30) / 1000)).toEqual({ dato: '2026-07-15', time: 23 })
  })
})

describe('natteravn', () => {
  test('bevægelse lægges i den lokale time', () => {
    const timer = meterPrTime([p(kl(2), 55), p(kl(3), 55.001), p(kl(14), 55.003)])
    expect(timer[3]).toBeGreaterThan(105)
    expect(timer[14]).toBeGreaterThan(215)
    expect(timer.reduce((a, b) => a + b, 0)).toBe(timer[3] + timer[14])
  })

  test('score er nattens andel af bevægelsen', () => {
    const timer = Array<number>(24).fill(0)
    timer[2] = 750
    timer[14] = 250
    expect(natteravn(timer)).toEqual({ score: 75, label: 'Natteravn – jagter mest i mørke' })
    timer[2] = 0
    expect(natteravn(timer).score).toBe(0)
  })

  test('for lidt bevægelse giver ingen score', () => {
    expect(natteravn(Array<number>(24).fill(5)).score).toBeNull()
  })
})

describe('spurter', () => {
  test('bruger trackerens hastighed, og hurtige målinger tæt på hinanden er én spurt', () => {
    const fundet = spurter([
      p(0, 55, 12, { speed: 1 }),
      p(60, 55.0005, 12, { speed: 4 }),
      p(100, 55.001, 12, { speed: 6 }),
      p(160, 55.0012, 12, { speed: 1 }),
      p(3600, 55.002, 12, { speed: 5 }),
    ])
    expect(fundet.map(s => [s.time, s.top_kmt])).toEqual([[60, 21.6], [3600, 18]])
  })

  test('uden hastighed regnes den af afstand og tid – men kun mellem tætte målinger', () => {
    // 111 m på 20 s = 5,6 m/s
    expect(spurter([p(0, 55), p(20, 55.001)])).toHaveLength(1)
    // samme afstand på 10 minutter er en gåtur
    expect(spurter([p(0, 55), p(600, 55.001)])).toHaveLength(0)
  })

  test('GPS-hop og upræcise målinger er ikke spurter', () => {
    expect(spurter([p(0, 55, 12, { speed: 25 })])).toHaveLength(0)
    expect(spurter([p(0, 55, 12, { speed: 5, uncertainty: 80 })])).toHaveLength(0)
  })
})

describe('territorium', () => {
  test('areal af et kvadrat på ca. 111 × 64 m, uanset punkter indeni', () => {
    const t = territorium([p(1, 55, 12), p(2, 55.001, 12), p(3, 55.001, 12.001), p(4, 55, 12.001), p(5, 55.0005, 12.0005)])
    expect(t.areal_m2).toBeGreaterThan(7000)
    expect(t.areal_m2).toBeLessThan(7200)
    expect(t.omrids).toHaveLength(4)
  })

  test('for få punkter, punkter på linje og upræcise målinger giver intet areal', () => {
    expect(territorium([p(1, 55), p(2, 55.001)]).areal_m2).toBe(0)
    expect(territorium([p(1, 55), p(2, 55.001), p(3, 55.002)]).areal_m2).toBe(0)
    const medHop = territorium([p(1, 55, 12), p(2, 55.001, 12), p(3, 55.001, 12.001), p(4, 56, 13, { uncertainty: 500 })])
    expect(medHop.areal_m2).toBeLessThan(4000)
  })
})

describe('hjemme og ude', () => {
  const hjem = { lat: 55, lng: 12, radius: 50 }

  test('tiden tilskrives det sted, katten var ved målingen', () => {
    // hjemme 1 time, ude 3 timer, hjemme igen den sidste time frem til "nu"
    const r = hjemmeUde([p(0, 55), p(3600, 55.002), p(4 * 3600, 55.0001)], hjem, 5 * 3600)
    expect(r).toEqual({ hjemme_min: 120, ude_min: 180, hjemme_pct: 40 })
  })

  test('et hul på over seks timer tæller kun som seks', () => {
    expect(hjemmeUde([p(0, 55)], hjem, 24 * 3600).hjemme_min).toBe(360)
  })

  test('ingen målinger giver ingen procent', () => {
    expect(hjemmeUde([], hjem, 100).hjemme_pct).toBeNull()
  })
})

describe('favoritsteder', () => {
  const hjem = { lat: 55, lng: 12, radius: 50 }

  test('længste ophold først, hjemmet og korte stop er ikke med', () => {
    const fundet = hotspots([
      p(0, 55), // hjemme
      p(3600, 55.003, 12.00010), // skuret: 2 timer
      p(2 * 3600, 55.003, 12.00012),
      p(3 * 3600, 55.006), // hækken: 30 min
      p(3.5 * 3600, 55.009), // forbi på 5 min – for kort
      p(3.5 * 3600 + 300, 55.003, 12.00011), // skuret igen: 1 time
      p(4.5 * 3600 + 300, 55),
    ], hjem, 5 * 3600)
    expect(fundet.map(h => [h.minutter, h.besøg])).toEqual([[180, 2], [30, 1]])
    expect(fundet[0].lat).toBeCloseTo(55.003, 4)
    expect(fundet[0].afstand_hjem_m).toBeGreaterThan(325)
    expect(fundet[0].afstand_hjem_m).toBeLessThan(340)
  })

  test('et sted, der ligger hen over en feltgrænse, er stadig ét sted', () => {
    // Målinger spredt ±15 m om samme punkt rammer flere gitterfelter
    const spredt = Array.from({ length: 40 }, (_, i) =>
      p(i * 600, 55.003 + ((i % 4) - 1.5) * 0.00009, 12 + ((i % 3) - 1) * 0.00015))
    const fundet = hotspots(spredt, hjem, 40 * 600)
    expect(fundet).toHaveLength(1)
    expect(fundet[0]).toMatchObject({ minutter: 400, besøg: 1 })
  })

  test('uden hjemmepunkt tæller alle steder, og afstanden hjem er ukendt', () => {
    const [h] = hotspots([p(0, 55), p(3600, 55)], null, 7200)
    expect(h).toMatchObject({ minutter: 120, afstand_hjem_m: null })
  })
})

describe('batteri-prognose', () => {
  const m = (timer: number, level: number, charging = false) => ({ time: timer * 3600, level, charging })

  test('fremskriver forbruget siden seneste opladning', () => {
    // 20 % → opladet til 100 % → 76 % et døgn senere: 24 %/døgn, tomt om 76 timer
    const r = batteriPrognose([m(0, 30), m(5, 20), m(6, 100), m(18, 88), m(30, 76)])!
    expect(r.pct_pr_døgn).toBe(24)
    expect(r.timer_tilbage).toBe(76)
    expect(r.tom_time).toBe((30 + 76) * 3600)
  })

  test('ingen prognose under opladning, med for kort historik eller uden fald', () => {
    expect(batteriPrognose([m(0, 50), m(10, 60, true)])).toBeNull()
    expect(batteriPrognose([m(0, 80), m(1, 75)])).toBeNull()
    expect(batteriPrognose([m(0, 80), m(10, 80)])).toBeNull()
    expect(batteriPrognose([m(0, 80)])).toBeNull()
  })

  test('en måling under opladning afgrænser afladningen, også uden hop i niveau', () => {
    const r = batteriPrognose([m(0, 90), m(1, 90, true), m(2, 90), m(12, 80)])!
    expect(r.pct_pr_døgn).toBe(24)
  })
})

describe('streak', () => {
  const dag = (dato: string, aktiv: number | null, maal: number | null = 60): Dag =>
    ({ dato, aktiv_min: aktiv, maal_min: maal, hvile_min: null, dagsoevn_min: null, natsoevn_min: null, kalorier: null })

  test('tæller dage i træk bagud fra i dag', () => {
    const dage = [dag('2026-03-28', 10), dag('2026-03-29', 70), dag('2026-03-30', 60), dag('2026-03-31', 90), dag('2026-04-01', 65)]
    expect(streak(dage, '2026-04-01')).toBe(4)
  })

  test('i dag bryder ikke rækken, før dagen er slut', () => {
    expect(streak([dag('2026-03-31', 90), dag('2026-04-01', 5)], '2026-04-01')).toBe(1)
    expect(streak([dag('2026-03-31', 90)], '2026-04-01')).toBe(1)
  })

  test('en dag uden data eller uden mål bryder rækken', () => {
    expect(streak([dag('2026-03-29', 90), dag('2026-03-31', 90)], '2026-03-31')).toBe(1)
    expect(streak([dag('2026-03-31', 90, null)], '2026-03-31')).toBe(0)
    expect(streak([], '2026-03-31')).toBe(0)
  })
})
