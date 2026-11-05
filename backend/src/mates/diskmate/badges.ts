import { get } from './sql'

const THROW_TIERS = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]
const ROUND_TIERS = [1, 5, 10, 25, 50, 100, 250, 500, 1_000]
const COURSE_TIERS = [1, 5, 10, 25]
const ACE_TIERS = [1, 5, 10, 25]
const HOLES_UNDER_PAR_TIERS = [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500]

/** 1000 → "1.000" */
export const tusind = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const tiered = (prefix: string, category: string, icon: string, tiers: number[], progress: number, label: (n: number) => string, desc: (n: number) => string) =>
  tiers.map(target => ({ id: `${prefix}_${target}`, category, icon, label: label(target), description: desc(target), achieved: progress >= target, progress, target }))

const count = (sql: string, player: string) => (get<{ n: number }>(sql, player)?.n ?? 0)

export function playerBadges(player: string) {
  const throws = count('SELECT COALESCE(SUM(total_score), 0) AS n FROM rounds WHERE player_name = ?1', player)
  const rounds = count('SELECT COUNT(*) AS n FROM rounds WHERE player_name = ?1', player)
  const courses = count('SELECT COUNT(DISTINCT l.course_id) AS n FROM rounds r JOIN layouts l ON l.id = r.layout_id WHERE r.player_name = ?1', player)
  const aces = count('SELECT COUNT(*) AS n FROM round_scores rs JOIN rounds r ON r.id = rs.round_id WHERE r.player_name = ?1 AND rs.strokes = 1', player)
  const roundsUnder = count('SELECT COUNT(*) AS n FROM rounds WHERE player_name = ?1 AND to_par < 0', player)
  const holesUnder = count('SELECT COUNT(*) AS n FROM round_scores rs JOIN rounds r ON r.id = rs.round_id WHERE r.player_name = ?1 AND rs.to_par < 0', player)

  const badges = [
    ...tiered('throws', 'Kast', '🥏', THROW_TIERS, throws, n => `${tusind(n)} kast`, n => `Kastet mindst ${tusind(n)} discs i alt på tværs af alle runder.`),
    ...tiered('rounds', 'Runder', '📅', ROUND_TIERS, rounds, n => `${tusind(n)} runder`, n => `Spillet mindst ${tusind(n)} runder.`),
    ...tiered('courses', 'Baner', '🗺️', COURSE_TIERS, courses, n => `${tusind(n)} baner`, n => `Spillet på mindst ${tusind(n)} forskellige baner.`),
    ...tiered('aces', 'Ace', '🎯', ACE_TIERS, aces, n => (n === 1 ? '1 ace' : `${n} aces`), n => `Slået mindst ${n} hole-in-one.`),
    ...tiered('rounds_under_par', 'Runder under par', '🔻', ROUND_TIERS, roundsUnder, n => `${tusind(n)} runder under par`, n => `Spillet mindst ${tusind(n)} runder under par.`),
    ...tiered('holes_under_par', 'Huller under par', '🐦', HOLES_UNDER_PAR_TIERS, holesUnder, n => `${tusind(n)} huller under par`, n => `Spillet mindst ${tusind(n)} enkelte huller under par (birdie eller bedre).`),
  ]
  const personal_best = get(
    `SELECT r.to_par, r.date, c.name AS course_name, l.name AS layout_name
     FROM rounds r JOIN layouts l ON l.id = r.layout_id JOIN courses c ON c.id = l.course_id
     WHERE r.player_name = ?1 ORDER BY r.to_par ASC, r.date ASC LIMIT 1`,
    player,
  )
  return { badges, personal_best }
}
