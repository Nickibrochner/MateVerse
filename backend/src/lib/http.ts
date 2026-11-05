import { Elysia } from 'elysia'

/** Fejl med HTTP-status, som alle mates kan kaste. Svaret bliver `{ error: message }`. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} findes ikke`)

/** Plugin, der oversætter HttpError til et JSON-svar. Bruges af hver mate. */
export const httpErrors = new Elysia({ name: 'http-errors' })
  .error({ HttpError })
  .onError({ as: 'global' }, ({ code, error, set }) => {
    if (code === 'HttpError') {
      set.status = error.status
      return { error: error.message }
    }
  })

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
