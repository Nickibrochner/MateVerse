import { Elysia, t } from 'elysia'
import { httpErrors, notFound } from '../../lib/http'
import { commands } from './commands'

/**
 * DiskMate eksponerer sine kommandoer som `POST /diskmate/rpc/<kommando>` med argumenterne som JSON –
 * samme navne og argumenter som Tauri-udgaven, så siderne kunne flyttes over næsten uændret.
 */
export const diskmate = new Elysia({ prefix: '/diskmate' })
  .use(httpErrors)
  .get('/commands', () => Object.keys(commands).sort())
  .post('/rpc/:command', async ({ params, body }) => {
    const fn = commands[params.command]
    if (!fn) throw notFound(`Kommandoen '${params.command}'`)
    // Pakkes ind, så også null/ingen returværdi bliver gyldig JSON
    return { result: (await fn((body ?? {}) as Record<string, unknown>)) ?? null }
  }, { params: t.Object({ command: t.String() }), body: t.Optional(t.Any()) })
