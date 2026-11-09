import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { db } from './db'
import { stockmate } from './mates/stockmate/routes'
import { econmate } from './mates/econmate/routes'
import { kanmate } from './mates/kanmate/routes'
import { kinmate } from './mates/kinmate/routes'
import { diskmate } from './mates/diskmate/routes'
import { contactmate } from './mates/contactmate/routes'
import { mate500 } from './mates/500mate/routes'
import { foodmate } from './mates/foodmate/routes'
import { catmate } from './mates/catmate/routes'

const PORT = Number(process.env.PORT ?? 3000)

export interface User {
  id: number
  username: string
  created_at: string
}

/**
 * Hubbens API. Fælles ting (brugere, sundhedstjek) ligger i roden,
 * og hver mate monteres som et Elysia-plugin under sit eget præfiks.
 */
const app = new Elysia()
  .use(cors())
  .onError(({ code, error, set }) => {
    if (code === 'NOT_FOUND') {
      set.status = 404
      return { error: 'Findes ikke' }
    }
    if (code === 'VALIDATION') {
      set.status = 400
      return { error: 'Ugyldige data' }
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error(error)
    return { error: message }
  })
  .get('/health', () => ({ ok: true }))
  .get('/users', () => db.query('SELECT * FROM user ORDER BY id').all() as User[])
  .post(
    '/users',
    ({ body, set }) => {
      const username = body.username.trim()
      if (!username) {
        set.status = 400
        return { error: 'Navn mangler' }
      }
      try {
        return db.query('INSERT INTO user (username) VALUES (?) RETURNING *').get(username) as User
      } catch {
        set.status = 409
        return { error: 'Brugeren findes allerede' }
      }
    },
    { body: t.Object({ username: t.String() }) },
  )
  .use(stockmate)
  .use(econmate)
  .use(kanmate)
  .use(kinmate)
  .use(diskmate)
  .use(contactmate)
  .use(mate500)
  .use(foodmate)
  .use(catmate)
  .listen(PORT)

console.log(`MateVerse API kører på http://localhost:${app.server?.port}`)

export type App = typeof app
