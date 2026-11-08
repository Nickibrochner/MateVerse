import { db } from '../../db'
import { beregnMelderPoint, beregnModspillerPoint, FARVER } from './scoring'

/**
 * Al forretningslogik for 500Mate: spillere, spil, runder (inkl. validering + pointberegning),
 * kumulative totaler og leaderboard. routes.ts er en tynd HTTP-wrapper omkring denne fil, så
 * logikken kan testes direkte (se 500mate.test.ts) uden at gå via Elysia.
 *
 * Henter altid alt og grupperer i app-koden (samme mønster som DiskMate/ContactMate i denne
 * kodebase) i stedet for N+1-kald eller én stor korreleret SQL-forespørgsel.
 */

export interface Player {
  id: number
  navn: string
  farve: string
  aktiv: number
  created_at: string
}

export interface Game {
  id: number
  navn: string | null
  dato: string
  afsluttet: number
  vinder_id: number | null
  notat: string | null
  created_at: string
}

export interface GameWithPlayers extends Game {
  spillere: (Player & { position: number })[]
}

// ── Spillere ─────────────────────────────────────────────────────────────────

export function listActivePlayers(): Player[] {
  return db.query('SELECT * FROM mate500_player WHERE aktiv = 1 ORDER BY navn').all() as Player[]
}

export function createPlayer(navn: string, farve: string): Player {
  navn = navn.trim()
  if (!navn) throw new Error('Navn mangler')
  const findes = db.query('SELECT 1 FROM mate500_player WHERE navn = ?').get(navn)
  if (findes) throw new Error('Spilleren findes allerede')
  return db.query('INSERT INTO mate500_player (navn, farve) VALUES (?, ?) RETURNING *').get(navn, farve) as Player
}

export function updatePlayer(id: number, navn: string, farve: string): Player | null {
  db.query('UPDATE mate500_player SET navn = ?, farve = ? WHERE id = ?').run(navn.trim(), farve, id)
  return db.query('SELECT * FROM mate500_player WHERE id = ?').get(id) as Player | null
}

export function deactivatePlayer(id: number): void {
  db.query('UPDATE mate500_player SET aktiv = 0 WHERE id = ?').run(id)
}

// ── Spil ─────────────────────────────────────────────────────────────────────

export function gamesWithPlayers(): GameWithPlayers[] {
  const games = db.query('SELECT * FROM mate500_game ORDER BY id DESC').all() as Game[]
  const rows = db.query(
    `SELECT gp.game_id, gp.position, p.* FROM mate500_game_player gp
     JOIN mate500_player p ON p.id = gp.player_id
     ORDER BY gp.position ASC`,
  ).all() as (Player & { game_id: number; position: number })[]

  const byGame = new Map<number, (Player & { position: number })[]>()
  for (const { game_id, ...rest } of rows) {
    byGame.set(game_id, [...(byGame.get(game_id) ?? []), rest])
  }
  return games.map(g => ({ ...g, spillere: byGame.get(g.id) ?? [] }))
}

export function getGame(id: number): Game | null {
  return db.query('SELECT * FROM mate500_game WHERE id = ?').get(id) as Game | null
}

export function createGame(navn: string | undefined, dato: string, playerIds: number[]): GameWithPlayers {
  const ids = [...new Set(playerIds)]
  if (ids.length < 3) throw new Error('Et spil kræver mindst 3 spillere')
  const fundne = (
    db.query(`SELECT id FROM mate500_player WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number }[]
  ).map(r => r.id)
  if (fundne.length !== ids.length) throw new Error('En eller flere spillere findes ikke')

  const game = db.query('INSERT INTO mate500_game (navn, dato) VALUES (?, ?) RETURNING *').get(navn?.trim() || null, dato) as Game
  ids.forEach((playerId, position) => {
    db.query('INSERT INTO mate500_game_player (game_id, player_id, position) VALUES (?, ?, ?)').run(game.id, playerId, position)
  })
  return gamesWithPlayers().find(g => g.id === game.id)!
}

export function finishGame(id: number): GameWithPlayers {
  const game = getGame(id)
  if (!game) throw new Error('Spillet findes ikke')
  const totaler = db.query(
    'SELECT player_id, SUM(point) AS total FROM mate500_round_point rp JOIN mate500_round r ON r.id = rp.round_id WHERE r.game_id = ? GROUP BY player_id',
  ).all(id) as { player_id: number; total: number }[]
  const vinder = totaler.reduce<{ player_id: number; total: number } | null>(
    (bedst, t) => (!bedst || t.total > bedst.total ? t : bedst),
    null,
  )
  db.query('UPDATE mate500_game SET afsluttet = 1, vinder_id = ? WHERE id = ?').run(vinder?.player_id ?? null, id)
  return gamesWithPlayers().find(g => g.id === id)!
}

export function deleteGame(id: number): void {
  db.query('DELETE FROM mate500_game WHERE id = ?').run(id)
}

export function updateGameNote(id: number, notat: string | undefined): void {
  if (!getGame(id)) throw new Error('Spillet findes ikke')
  db.query('UPDATE mate500_game SET notat = ? WHERE id = ?').run(notat || null, id)
}

// ── Runder ───────────────────────────────────────────────────────────────────

export interface RoundPointRow {
  player_id: number
  navn: string
  farve: string
  point: number
  stik_vundet: number
}

export interface RoundWithPoints {
  id: number
  game_id: number
  runde_nr: number
  melding_spiller_id: number | null
  melding_antal: number | null
  melding_farve: string | null
  created_at: string
  points: RoundPointRow[]
}

export function roundsForGame(gameId: number): RoundWithPoints[] {
  const rounds = db.query('SELECT * FROM mate500_round WHERE game_id = ? ORDER BY runde_nr ASC').all(gameId) as Omit<
    RoundWithPoints,
    'points'
  >[]
  const points = db.query(
    `SELECT rp.round_id, rp.player_id, p.navn, p.farve, rp.point, rp.stik_vundet
     FROM mate500_round_point rp JOIN mate500_player p ON p.id = rp.player_id
     WHERE rp.round_id IN (SELECT id FROM mate500_round WHERE game_id = ?)`,
  ).all(gameId) as (RoundPointRow & { round_id: number })[]

  const byRound = new Map<number, RoundPointRow[]>()
  for (const { round_id, ...rest } of points) {
    byRound.set(round_id, [...(byRound.get(round_id) ?? []), rest])
  }
  return rounds.map(r => ({ ...r, points: byRound.get(r.id) ?? [] }))
}

export interface AddRoundInput {
  melding_spiller_id?: number | null
  melding_antal?: number | null
  melding_farve?: string | null
  points: { player_id: number; stik_vundet: number }[]
}

export function addRound(gameId: number, input: AddRoundInput): RoundWithPoints {
  const game = getGame(gameId)
  if (!game) throw new Error('Spillet findes ikke')
  if (game.afsluttet) throw new Error('Spillet er afsluttet — kan ikke tilføje flere runder')

  const deltagere = new Set(
    (db.query('SELECT player_id FROM mate500_game_player WHERE game_id = ?').all(gameId) as { player_id: number }[]).map(
      r => r.player_id,
    ),
  )
  if (input.points.length !== deltagere.size || input.points.some(p => !deltagere.has(p.player_id))) {
    throw new Error('Point skal angives for præcis alle spillere i spillet')
  }
  const sumStik = input.points.reduce((a, p) => a + p.stik_vundet, 0)
  if (sumStik !== 10) throw new Error(`Stik skal summere til 10 (var ${sumStik})`)
  if (input.points.some(p => p.stik_vundet < 0 || p.stik_vundet > 10)) {
    throw new Error('Stik pr. spiller skal være mellem 0 og 10')
  }

  let meldingSpillerId: number | null = null
  let meldingAntal: number | null = null
  let meldingFarve: string | null = null
  if (input.melding_farve) {
    if (!FARVER.includes(input.melding_farve as (typeof FARVER)[number])) throw new Error(`Ukendt farve: ${input.melding_farve}`)
    if (input.melding_spiller_id == null || !deltagere.has(input.melding_spiller_id)) {
      throw new Error('Melder skal være en af spillerne i spillet')
    }
    meldingSpillerId = input.melding_spiller_id
    meldingFarve = input.melding_farve
    if (meldingFarve !== 'nullo') {
      if (input.melding_antal == null || input.melding_antal < 6 || input.melding_antal > 10) {
        throw new Error('Meldingens antal skal være mellem 6 og 10')
      }
      meldingAntal = input.melding_antal
    }
  }

  const { n: rundeNr } = db.query('SELECT COUNT(*) AS n FROM mate500_round WHERE game_id = ?').get(gameId) as { n: number }
  const round = db
    .query(
      'INSERT INTO mate500_round (game_id, runde_nr, melding_spiller_id, melding_antal, melding_farve) VALUES (?, ?, ?, ?, ?) RETURNING *',
    )
    .get(gameId, rundeNr + 1, meldingSpillerId, meldingAntal, meldingFarve) as { id: number }

  for (const p of input.points) {
    const point =
      meldingSpillerId === p.player_id
        ? beregnMelderPoint(meldingFarve!, meldingAntal ?? 0, p.stik_vundet)
        : beregnModspillerPoint(p.stik_vundet)
    db.query('INSERT INTO mate500_round_point (round_id, player_id, point, stik_vundet) VALUES (?, ?, ?, ?)').run(
      round.id, p.player_id, point, p.stik_vundet,
    )
  }

  return roundsForGame(gameId).find(r => r.id === round.id)!
}

export function deleteRound(id: number): void {
  db.query('DELETE FROM mate500_round WHERE id = ?').run(id)
}

// ── Totaler og leaderboard ───────────────────────────────────────────────────

export interface RundeTotal {
  runde_nr: number
  totaler: { player_id: number; point: number; kumulativt: number }[]
}

export function totalerForGame(gameId: number): RundeTotal[] {
  const rounds = roundsForGame(gameId)
  const kumulativt = new Map<number, number>()
  return rounds.map(r => {
    const totaler = r.points.map(p => {
      const sum = (kumulativt.get(p.player_id) ?? 0) + p.point
      kumulativt.set(p.player_id, sum)
      return { player_id: p.player_id, point: p.point, kumulativt: sum }
    })
    return { runde_nr: r.runde_nr, totaler }
  })
}

export interface LeaderboardRow {
  player_id: number
  navn: string
  farve: string
  aktiv: number
  spil_spillet: number
  sejre: number
  total_point: number
  bedste_spil: number | null
  kontrakt_forsoegt: number
  kontrakt_vundet: number
  grand_slams: number
  nullo_sejre: number
}

export function leaderboard(): LeaderboardRow[] {
  const players = db.query('SELECT * FROM mate500_player ORDER BY navn').all() as Player[]
  const gamePlayers = db.query('SELECT game_id, player_id FROM mate500_game_player').all() as {
    game_id: number
    player_id: number
  }[]
  const games = new Map((db.query('SELECT * FROM mate500_game').all() as Game[]).map(g => [g.id, g]))
  const points = db.query(
    `SELECT r.game_id, r.melding_spiller_id, r.melding_farve, rp.player_id, rp.point, rp.stik_vundet
     FROM mate500_round_point rp JOIN mate500_round r ON r.id = rp.round_id`,
  ).all() as {
    game_id: number
    melding_spiller_id: number | null
    melding_farve: string | null
    player_id: number
    point: number
    stik_vundet: number
  }[]

  const spilSpillet = new Map<number, Set<number>>()
  for (const gp of gamePlayers) {
    if (!spilSpillet.has(gp.player_id)) spilSpillet.set(gp.player_id, new Set())
    spilSpillet.get(gp.player_id)!.add(gp.game_id)
  }

  const sejre = new Map<number, number>()
  for (const g of games.values()) {
    if (g.afsluttet && g.vinder_id != null) sejre.set(g.vinder_id, (sejre.get(g.vinder_id) ?? 0) + 1)
  }

  const totalPr = new Map<number, number>()
  const prSpil = new Map<string, number>()
  const forsoegt = new Map<number, number>()
  const vundet = new Map<number, number>()
  const grandSlams = new Map<number, number>()
  const nulloSejre = new Map<number, number>()

  for (const p of points) {
    totalPr.set(p.player_id, (totalPr.get(p.player_id) ?? 0) + p.point)
    const key = `${p.player_id}:${p.game_id}`
    prSpil.set(key, (prSpil.get(key) ?? 0) + p.point)

    if (p.melding_spiller_id === p.player_id) {
      forsoegt.set(p.player_id, (forsoegt.get(p.player_id) ?? 0) + 1)
      if (p.point > 0) vundet.set(p.player_id, (vundet.get(p.player_id) ?? 0) + 1)
      if (p.melding_farve !== 'nullo' && p.stik_vundet === 10) {
        grandSlams.set(p.player_id, (grandSlams.get(p.player_id) ?? 0) + 1)
      }
      if (p.melding_farve === 'nullo' && p.point === 250) {
        nulloSejre.set(p.player_id, (nulloSejre.get(p.player_id) ?? 0) + 1)
      }
    }
  }

  const bedsteSpil = new Map<number, number>()
  for (const [key, sum] of prSpil) {
    const playerId = Number(key.split(':')[0])
    bedsteSpil.set(playerId, Math.max(bedsteSpil.get(playerId) ?? -Infinity, sum))
  }

  return players.map(p => ({
    player_id: p.id,
    navn: p.navn,
    farve: p.farve,
    aktiv: p.aktiv,
    spil_spillet: spilSpillet.get(p.id)?.size ?? 0,
    sejre: sejre.get(p.id) ?? 0,
    total_point: totalPr.get(p.id) ?? 0,
    bedste_spil: bedsteSpil.has(p.id) ? (bedsteSpil.get(p.id) as number) : null,
    kontrakt_forsoegt: forsoegt.get(p.id) ?? 0,
    kontrakt_vundet: vundet.get(p.id) ?? 0,
    grand_slams: grandSlams.get(p.id) ?? 0,
    nullo_sejre: nulloSejre.get(p.id) ?? 0,
  }))
}

export function backup() {
  return {
    spillere: db.query('SELECT * FROM mate500_player').all(),
    spil: db.query('SELECT * FROM mate500_game').all(),
    spil_spillere: db.query('SELECT * FROM mate500_game_player').all(),
    runder: db.query('SELECT * FROM mate500_round').all(),
    runde_point: db.query('SELECT * FROM mate500_round_point').all(),
  }
}
