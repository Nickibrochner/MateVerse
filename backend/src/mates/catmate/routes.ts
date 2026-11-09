import { Elysia, t } from 'elysia'
import { HttpError, httpErrors } from '../../lib/http'
import { ruteStat } from './geo'
import {
  TractiveError, afbryd, erForbundet, getSetting, hentPets, hentRute, login, saveSetting, tømCache,
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

const settings = () => ({ email: getSetting('email'), forbundet: erForbundet() })

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
    params: t.Object({ id: t.String({ pattern: '^[A-Za-z0-9_-]+$' }) }),
    query: t.Object({ timer: t.Optional(t.String()) }),
  })
