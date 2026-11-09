import { Elysia, t } from 'elysia'
import { HttpError, httpErrors } from '../../lib/http'
import {
  batteriPrognose, hjemmeUde, hotspots, lokalTid, meterPrTime, måletNået, natteravn, spurter, streak, territorium,
} from './analyse'
import { ruteStat } from './geo'
import {
  TractiveError, afbryd, batteriMålinger, dage, erForbundet, getHjem, getSetting, hentPets, hentRute, login,
  saveSetting, synkSundhed, tømCache,
} from './tractive'

/**
 * CatMate — kattens Tractive GPS-tracker: seneste position, batteri og rute. Al snak med Tractive
 * ligger i tractive.ts og geometrien i geo.ts — denne fil er kun HTTP-wrapping.
 */

/** Tractive-fejl bliver til 502 (eller 409, hvis der slet ikke er logget ind), så frontenden kan vise beskeden. */
async function tractive<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof TractiveError) throw new HttpError(e.status === 409 ? 409 : 502, e.message)
    throw e
  }
}

const settings = () => ({ email: getSetting('email'), forbundet: erForbundet(), hjem: getHjem() })

const trackerParams = t.Object({ id: t.String({ pattern: '^[A-Za-z0-9_-]+$' }) })

export const catmate = new Elysia({ prefix: '/catmate' })
  .use(httpErrors)

  // ── Indstillinger ────────────────────────────────────────────────────────────
  .get('/settings', () => settings())
  .put('/settings', async ({ body }) => {
    const email = body.email.trim()
    // Login prøves af, før noget gemmes – så en tastefejl ikke efterlader en død forbindelse.
    try {
      await login(email, body.password)
    } catch (e) {
      if (e instanceof TractiveError) throw new HttpError(e.status === 401 || e.status === 403 ? 400 : 502, e.message)
      throw e
    }
    saveSetting('email', email)
    saveSetting('password', body.password)
    tømCache()
    return settings()
  }, { body: t.Object({ email: t.String({ minLength: 3 }), password: t.String({ minLength: 1 }) }) })
  .delete('/settings', () => {
    afbryd()
    return settings()
  })

  // ── Data ─────────────────────────────────────────────────────────────────────
  .get('/pets', () => tractive(hentPets))
  .get('/trackers/:id/route', async ({ params, query }) => {
    if (!erForbundet()) throw new HttpError(409, 'Tractive er ikke forbundet – log ind under Indstillinger')
    const timer = Math.min(Math.max(Number(query.timer) || 24, 1), 24 * 31)
    const rute = await hentRute(params.id, timer)
    return { ...rute, stat: ruteStat(rute.points) }
  }, {
    params: trackerParams,
    query: t.Object({ timer: t.Optional(t.String()) }),
  })

  // Hjemmepunktet bruges til hjemme/ude-tid og til at holde hjemmet ude af favoritstederne.
  .put('/hjem', ({ body }) => {
    saveSetting('hjem', JSON.stringify(body))
    return settings()
  }, {
    body: t.Object({
      lat: t.Number({ minimum: -90, maximum: 90 }), lng: t.Number({ minimum: -180, maximum: 180 }),
      radius: t.Number({ minimum: 10, maximum: 500 }),
    }),
  })

  // Alle indsigter i ét kald: i dag (siden midnat) og de seneste syv døgn.
  .get('/trackers/:id/indsigt', async ({ params }) => {
    const pets = await tractive(hentPets)
    const pet = pets.find(p => p.tracker_id === params.id)
    if (!pet) throw new HttpError(404, 'Trackeren findes ikke på Tractive-kontoen')

    const nu = Math.floor(Date.now() / 1000)
    const [rute, sundhedFejl] = await Promise.all([hentRute(pet.tracker_id, 7 * 24), synkSundhed(pet)])
    const iDag = lokalTid(nu).dato
    const dagens = rute.points.filter(p => lokalTid(p.time).dato === iDag)
    const hjem = getHjem()
    const timer = meterPrTime(rute.points)
    const alleDage = dage(pet.tracker_id, lokalTid(nu - 60 * 86_400).dato)

    return {
      navn: pet.navn,
      hjem,
      rute_fejl: rute.fejl,
      i_dag: {
        dato: iDag,
        afstand_m: ruteStat(dagens).afstand_m,
        spurter: spurter(dagens),
        hjemme: hjem ? hjemmeUde(dagens, hjem, nu) : null,
      },
      uge: {
        punkter: rute.points.length,
        fra: rute.points[0]?.time ?? null,
        afstand_m: ruteStat(rute.points).afstand_m,
        spurter: spurter(rute.points),
        territorium: territorium(rute.points),
        hotspots: hotspots(rute.points, hjem, nu),
        hjemme: hjem ? hjemmeUde(rute.points, hjem, nu) : null,
        meter_pr_time: timer,
        natteravn: natteravn(timer),
      },
      batteri: {
        niveau: pet.batteri,
        lader: pet.lader,
        prognose: batteriPrognose(batteriMålinger(pet.tracker_id, nu - 14 * 86_400)),
      },
      sundhed: {
        fejl: sundhedFejl,
        i_dag: alleDage.find(d => d.dato === iDag) ?? null,
        streak: streak(alleDage, iDag),
        dage: alleDage.slice(-14).map(d => ({ ...d, maal_naaet: måletNået(d) })),
      },
    }
  }, { params: trackerParams })
