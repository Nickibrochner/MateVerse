import { Elysia, t } from 'elysia'
import { httpErrors, HttpError } from '../../lib/http'
import {
  addRound, backup, createGame, createPlayer, deactivatePlayer, deleteGame, deleteRound, finishGame,
  gamesWithPlayers, leaderboard, listActivePlayers, roundsForGame, totalerForGame, updateGameNote, updatePlayer,
} from './queries'

/**
 * 500Mate — scoretæller til kortspillet "500". Port af Tauri-udgaven. Al forretningslogik
 * (inkl. validering og pointberegning) ligger i queries.ts — denne fil er kun HTTP-wrapping.
 */

export const mate500 = new Elysia({ prefix: '/500mate' })
  .use(httpErrors)

  .get('/players', () => listActivePlayers())
  .post('/players', ({ body }) => {
    try {
      return createPlayer(body.navn, body.farve)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ navn: t.String({ minLength: 1 }), farve: t.String({ minLength: 1 }) }) })
  .put('/players/:id', ({ params, body }) => updatePlayer(Number(params.id), body.navn, body.farve), {
    body: t.Object({ navn: t.String({ minLength: 1 }), farve: t.String({ minLength: 1 }) }),
  })
  .delete('/players/:id', ({ params }) => {
    deactivatePlayer(Number(params.id))
    return { ok: true }
  })

  .get('/games', () => gamesWithPlayers())
  .post('/games', ({ body }) => {
    try {
      return createGame(body.navn, body.dato, body.player_ids)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ navn: t.Optional(t.String()), dato: t.String({ minLength: 1 }), player_ids: t.Array(t.Integer(), { minItems: 3 }) }) })
  .post('/games/:id/afslut', ({ params }) => {
    try {
      return finishGame(Number(params.id))
    } catch (e) {
      throw new HttpError(404, (e as Error).message)
    }
  })
  .delete('/games/:id', ({ params }) => {
    deleteGame(Number(params.id))
    return { ok: true }
  })
  .put('/games/:id/notat', ({ params, body }) => {
    try {
      updateGameNote(Number(params.id), body.notat)
      return { ok: true }
    } catch (e) {
      throw new HttpError(404, (e as Error).message)
    }
  }, { body: t.Object({ notat: t.Optional(t.String()) }) })

  .get('/games/:id/rounds', ({ params }) => roundsForGame(Number(params.id)))
  .post('/games/:id/rounds', ({ params, body }) => {
    try {
      return addRound(Number(params.id), body)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, {
    body: t.Object({
      melding_spiller_id: t.Optional(t.Nullable(t.Integer())),
      melding_antal: t.Optional(t.Nullable(t.Integer())),
      melding_farve: t.Optional(t.Nullable(t.String())),
      points: t.Array(t.Object({ player_id: t.Integer(), stik_vundet: t.Integer() })),
    }),
  })
  .delete('/rounds/:id', ({ params }) => {
    deleteRound(Number(params.id))
    return { ok: true }
  })

  .get('/games/:id/totaler', ({ params }) => totalerForGame(Number(params.id)))
  .get('/leaderboard', () => leaderboard())
  .get('/backup', () => backup())
