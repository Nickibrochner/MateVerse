import { json, request } from '../../api'

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

export interface AddRoundInput {
  melding_spiller_id?: number | null
  melding_antal?: number | null
  melding_farve?: string | null
  points: { player_id: number; stik_vundet: number }[]
}

export interface RundeTotal {
  runde_nr: number
  totaler: { player_id: number; point: number; kumulativt: number }[]
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

export const FARVER = [
  { id: 'spar', navn: 'Spar', basis: 40 },
  { id: 'klør', navn: 'Klør', basis: 60 },
  { id: 'ruder', navn: 'Ruder', basis: 80 },
  { id: 'hjerte', navn: 'Hjerte', basis: 100 },
  { id: 'sans', navn: 'Sans', basis: 120 },
  { id: 'nullo', navn: 'Nullo', basis: null },
] as const

export const SPILLERFARVER = [
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#0d9488',
  '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777',
]

export const mate500Api = {
  players: () => request<Player[]>('/500mate/players'),
  createPlayer: (navn: string, farve: string) => request<Player>('/500mate/players', json('POST', { navn, farve })),
  updatePlayer: (id: number, navn: string, farve: string) => request<Player>(`/500mate/players/${id}`, json('PUT', { navn, farve })),
  deletePlayer: (id: number) => request(`/500mate/players/${id}`, { method: 'DELETE' }),

  games: () => request<GameWithPlayers[]>('/500mate/games'),
  createGame: (navn: string | undefined, dato: string, playerIds: number[]) =>
    request<GameWithPlayers>('/500mate/games', json('POST', { navn, dato, player_ids: playerIds })),
  finishGame: (id: number) => request<GameWithPlayers>(`/500mate/games/${id}/afslut`, json('POST', {})),
  deleteGame: (id: number) => request(`/500mate/games/${id}`, { method: 'DELETE' }),
  updateGameNote: (id: number, notat: string) => request(`/500mate/games/${id}/notat`, json('PUT', { notat })),

  rounds: (gameId: number) => request<RoundWithPoints[]>(`/500mate/games/${gameId}/rounds`),
  addRound: (gameId: number, input: AddRoundInput) => request<RoundWithPoints>(`/500mate/games/${gameId}/rounds`, json('POST', input)),
  deleteRound: (id: number) => request(`/500mate/rounds/${id}`, { method: 'DELETE' }),

  totaler: (gameId: number) => request<RundeTotal[]>(`/500mate/games/${gameId}/totaler`),
  leaderboard: () => request<LeaderboardRow[]>('/500mate/leaderboard'),
  backup: () => request<Record<string, unknown>>('/500mate/backup'),
}
