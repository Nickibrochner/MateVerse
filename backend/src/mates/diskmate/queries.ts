import { all, get } from './sql'

/** Delte forespørgsler – oversat fra Tauri-udgavens queries.rs. */

export function courseStats(playerName: string | null) {
  // hole_count tælles live fra huller, så det matcher layout-administrationen
  return all<Record<string, unknown>>(
    `SELECT c.id AS course_id, c.name AS course_name, l.id AS layout_id, l.name AS layout_name,
            COUNT(DISTINCT h.id) AS hole_count,
            COUNT(DISTINCT r.id) AS rounds_played,
            COALESCE(AVG(r.to_par), 0.0) AS avg_to_par,
            COALESCE(MIN(r.to_par), 0) AS best_to_par,
            COALESCE(MAX(r.to_par), 0) AS worst_to_par
     FROM courses c
     JOIN layouts l ON l.course_id = c.id
     LEFT JOIN holes h ON h.layout_id = l.id
     LEFT JOIN rounds r ON r.layout_id = l.id AND (?1 IS NULL OR r.player_name = ?1)
     GROUP BY l.id
     ORDER BY c.name COLLATE NOCASE, l.name COLLATE NOCASE`,
    playerName,
  )
}

export const playerSummary = (playerName: string) => get<Record<string, unknown>>(
  `SELECT COUNT(*) AS rounds_played, COALESCE(AVG(to_par), 0.0) AS avg_to_par,
          COALESCE(MIN(to_par), 0) AS best_to_par, COALESCE(MAX(to_par), 0) AS worst_to_par,
          AVG(rating) AS avg_rating, MIN(date) AS first_round_date, MAX(date) AS last_round_date
   FROM rounds WHERE player_name = ?1`,
  playerName,
)!

export const playerRounds = (playerName: string) => all<{ round_id: number; layout_id: number; date: string; course_name: string; layout_name: string; total_score: number; to_par: number; rating: number | null }>(
  `SELECT r.id AS round_id, r.layout_id, r.date, c.name AS course_name, l.name AS layout_name, r.total_score, r.to_par, r.rating
   FROM rounds r JOIN layouts l ON l.id = r.layout_id JOIN courses c ON c.id = l.course_id
   WHERE r.player_name = ?1 ORDER BY r.date DESC`,
  playerName,
)

export const roundHoleScores = (roundId: number) => all(
  `SELECT rs.hole_number, rs.strokes, rs.par, rs.to_par, ch.label AS course_hole_label
   FROM round_scores rs
   LEFT JOIN rounds r ON r.id = rs.round_id
   LEFT JOIN holes h ON h.layout_id = r.layout_id AND h.hole_number = rs.hole_number
   LEFT JOIN course_holes ch ON ch.id = h.course_hole_id
   WHERE rs.round_id = ?1 ORDER BY rs.hole_number`,
  roundId,
)

const roundDiscNames = (roundId: number) => all<{ name: string }>(
  'SELECT d.name FROM round_discs rd JOIN discs d ON d.id = rd.disc_id WHERE rd.round_id = ?1 ORDER BY d.name COLLATE NOCASE', roundId,
).map(r => r.name)

const playedWith = (layoutId: number, date: string, playerName: string) => all<{ player_name: string }>(
  'SELECT DISTINCT player_name FROM rounds WHERE layout_id = ?1 AND date = ?2 AND player_name != ?3 ORDER BY player_name COLLATE NOCASE',
  layoutId, date, playerName,
).map(r => r.player_name)

export const roundConditions = (roundId: number) =>
  get<{ wind: string | null; weather: string | null }>('SELECT wind, weather FROM rounds WHERE id = ?1', roundId) ?? { wind: null, weather: null }

const discUsage = (playerName: string) => all(
  `SELECT d.id AS disc_id, d.name, d.brand, d.mold, d.category, d.speed, d.glide, d.turn, d.fade,
          d.weight_grams, d.plastic, d.condition,
          COUNT(DISTINCT rd.round_id) AS rounds_used, COALESCE(AVG(r.to_par), 0.0) AS avg_to_par
   FROM discs d JOIN round_discs rd ON rd.disc_id = d.id JOIN rounds r ON r.id = rd.round_id
   WHERE r.player_name = ?1 GROUP BY d.id ORDER BY rounds_used DESC, d.name COLLATE NOCASE`,
  playerName,
)

export const layoutsForCourseHole = (courseHoleId: number) => all<{ name: string }>(
  'SELECT DISTINCT l.name FROM holes h JOIN layouts l ON l.id = h.layout_id WHERE h.course_hole_id = ?1 ORDER BY l.name COLLATE NOCASE',
  courseHoleId,
).map(r => r.name)

/** Præstation pr. fysisk hul på tværs af layouts – samme kurv tælles samlet. */
const holePerformance = (playerName: string) => all<{ id: number; course_name: string; hole_label: string; times_played: number; avg_strokes: number; avg_to_par: number }>(
  `SELECT ch.id, c.name AS course_name, ch.label AS hole_label,
          COUNT(rs.id) AS times_played, COALESCE(AVG(rs.strokes), 0.0) AS avg_strokes, COALESCE(AVG(rs.to_par), 0.0) AS avg_to_par
   FROM course_holes ch
   JOIN courses c ON c.id = ch.course_id
   LEFT JOIN holes h ON h.course_hole_id = ch.id
   LEFT JOIN round_scores rs ON rs.hole_number = h.hole_number
     AND rs.round_id IN (SELECT r.id FROM rounds r WHERE r.layout_id = h.layout_id AND r.player_name = ?1)
   GROUP BY ch.id HAVING COUNT(rs.id) > 0
   ORDER BY c.name COLLATE NOCASE, ch.label COLLATE NOCASE`,
  playerName,
).map(({ id, ...p }) => ({ ...p, layouts: layoutsForCourseHole(id) }))

/** Alt om én spiller som ét JSON-dump – beregnet til at gemme og give til en LLM. */
export function buildPlayerExport(playerName: string) {
  return {
    player_name: playerName,
    summary: playerSummary(playerName),
    course_stats: courseStats(playerName).filter(c => (c.rounds_played as number) > 0),
    disc_usage: discUsage(playerName),
    hole_performance: holePerformance(playerName),
    rounds: playerRounds(playerName).map(r => ({
      round_id: r.round_id,
      date: r.date,
      course_name: r.course_name,
      layout_name: r.layout_name,
      total_score: r.total_score,
      to_par: r.to_par,
      rating: r.rating,
      ...roundConditions(r.round_id),
      discs_used: roundDiscNames(r.round_id),
      played_with: playedWith(r.layout_id, r.date, playerName),
      holes: roundHoleScores(r.round_id),
    })),
  }
}
