import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { db, DB_PATH } from '../../db'
import { HttpError, notFound } from '../../lib/http'
import { all, get, run } from './sql'
import { buildPlayerExport, courseStats, layoutsForCourseHole, playerRounds, playerSummary, roundConditions, roundHoleScores } from './queries'
import { playerBadges } from './badges'
import { backfillCourseHoles, importCsv } from './importer'

/**
 * DiskMates kommandoer med samme navne og argumenter som Tauri-udgavens `invoke()`-kald,
 * så frontendens sider kunne flyttes over næsten uændret. Argumenterne er camelCase,
 * som Tauri sender dem fra JavaScript.
 *
 * Kommandoer, der i Tauri skrev filer til en valgt sti (eksport og backup), returnerer i stedet
 * data, som frontenden lader brugeren hente. Billeder og CSV sendes som indhold i stedet for filstier.
 */

const IMAGES = join(dirname(DB_PATH), 'diskmate-billeder')
mkdirSync(IMAGES, { recursive: true })
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

type Args = Record<string, any>
const str = (a: Args, k: string) => {
  if (typeof a[k] !== 'string') throw new HttpError(400, `Mangler '${k}'`)
  return a[k] as string
}
const num = (a: Args, k: string) => {
  const v = Number(a[k])
  if (a[k] == null || !Number.isFinite(v)) throw new HttpError(400, `Mangler '${k}'`)
  return v
}
const optStr = (a: Args, k: string) => (a[k] == null ? null : String(a[k]))
const optNum = (a: Args, k: string) => (a[k] == null || a[k] === '' ? null : Number(a[k]))
const name = (v: string) => {
  const n = v.trim()
  if (!n) throw new HttpError(400, 'Navnet må ikke være tomt')
  return n
}

interface DiscRow { id: number; skill_levels: string | null; in_bag: number; lost: number; image_path: string | null; [k: string]: unknown }
const DISC_COLUMNS = `id, name, brand, mold, category, color, in_bag, speed, glide, turn, fade, weight_grams, plastic, condition, notes,
  image_path, holder, lost, skill_levels, best_wind, best_weather, stability, acquired_date`
const disc = (r: DiscRow) => ({
  ...r,
  in_bag: !!r.in_bag,
  lost: !!r.lost,
  skill_levels: (r.skill_levels ?? '').split(',').map(s => s.trim()).filter(Boolean),
})

function discValues(input: Args) {
  return [
    name(str(input, 'name')), optStr(input, 'brand'), optStr(input, 'mold'), input.category ?? 'Andet', optStr(input, 'color'),
    input.in_bag ? 1 : 0, optNum(input, 'speed'), optNum(input, 'glide'), optNum(input, 'turn'), optNum(input, 'fade'),
    optNum(input, 'weight_grams'), optStr(input, 'plastic'), optStr(input, 'condition'), optStr(input, 'notes'),
    optStr(input, 'holder'), input.lost ? 1 : 0, (input.skill_levels ?? []).join(','), optStr(input, 'best_wind'),
    optStr(input, 'best_weather'), optStr(input, 'stability'), optStr(input, 'acquired_date'),
  ]
}

const imagePath = (discId: number) => get<{ image_path: string | null }>('SELECT image_path FROM discs WHERE id = ?1', discId)?.image_path ?? null
const removeImage = (file: string | null) => { if (file) rmSync(join(IMAGES, basename(file)), { force: true }) }

/** Genberegner rundens totaler ud fra de tilbageværende hul-scores. */
function recalculateRound(roundId: number) {
  const { total_score, total_par } = get<{ total_score: number; total_par: number }>(
    'SELECT COALESCE(SUM(strokes), 0) AS total_score, COALESCE(SUM(par), 0) AS total_par FROM round_scores WHERE round_id = ?1', roundId,
  )!
  const to_par = total_score - total_par
  run('UPDATE rounds SET total_score = ?1, total_par = ?2, to_par = ?3 WHERE id = ?4', total_score, total_par, to_par, roundId)
  return { total_score, total_par, to_par }
}

const players = () => all<{ player_name: string }>('SELECT DISTINCT player_name FROM rounds ORDER BY player_name COLLATE NOCASE').map(r => r.player_name)

export const commands: Record<string, (a: Args) => unknown> = {
  // ── Import ──
  import_csv: a => importCsv(str(a, 'content')),

  // ── Baner og statistik ──
  get_players: () => players(),
  get_course_stats: a => courseStats(optStr(a, 'playerName')),
  get_hole_stats: a => all(
    `SELECT h.hole_number, h.par, COUNT(rs.id) AS times_played,
            COALESCE(AVG(rs.strokes), 0.0) AS avg_strokes, COALESCE(AVG(rs.to_par), 0.0) AS avg_to_par
     FROM holes h
     LEFT JOIN round_scores rs ON rs.hole_number = h.hole_number
       AND rs.round_id IN (SELECT r.id FROM rounds r WHERE r.layout_id = h.layout_id AND (?2 IS NULL OR r.player_name = ?2))
     WHERE h.layout_id = ?1 GROUP BY h.hole_number ORDER BY h.hole_number`,
    num(a, 'layoutId'), optStr(a, 'playerName'),
  ),
  get_history: a => all(
    'SELECT id AS round_id, date, to_par, total_score FROM rounds WHERE layout_id = ?1 AND player_name = ?2 ORDER BY date ASC',
    num(a, 'layoutId'), str(a, 'playerName'),
  ),
  rename_course: a => { run('UPDATE courses SET name = ?1 WHERE id = ?2', name(str(a, 'newName')), num(a, 'courseId')) },
  rename_layout: a => { run('UPDATE layouts SET name = ?1 WHERE id = ?2', name(str(a, 'newName')), num(a, 'layoutId')) },
  delete_course: a => { run('DELETE FROM courses WHERE id = ?1', num(a, 'courseId')) },
  delete_layout: a => { run('DELETE FROM layouts WHERE id = ?1', num(a, 'layoutId')) },

  // ── Fysiske huller og layout-administration ──
  get_course_holes: a => all('SELECT id, course_id, label FROM course_holes WHERE course_id = ?1 ORDER BY label COLLATE NOCASE', num(a, 'courseId')),
  create_course_hole: a => {
    const label = name(str(a, 'label'))
    const courseId = num(a, 'courseId')
    const { id } = get<{ id: number }>('INSERT INTO course_holes (course_id, label) VALUES (?1, ?2) RETURNING id', courseId, label)!
    return { id, course_id: courseId, label }
  },
  rename_course_hole: a => { run('UPDATE course_holes SET label = ?1 WHERE id = ?2', name(str(a, 'newLabel')), num(a, 'courseHoleId')) },
  delete_course_hole: a => { run('DELETE FROM course_holes WHERE id = ?1', num(a, 'courseHoleId')) },
  get_layout_holes: a => all(
    `SELECT h.hole_number, h.par, h.course_hole_id, ch.label AS course_hole_label
     FROM holes h LEFT JOIN course_holes ch ON ch.id = h.course_hole_id WHERE h.layout_id = ?1 ORDER BY h.hole_number`,
    num(a, 'layoutId'),
  ),
  set_layout_hole_mapping: a => {
    run('UPDATE holes SET course_hole_id = ?1 WHERE layout_id = ?2 AND hole_number = ?3', optNum(a, 'courseHoleId'), num(a, 'layoutId'), num(a, 'holeNumber'))
  },
  get_course_hole_stats: a => all<{ course_hole_id: number }>(
    `SELECT ch.id AS course_hole_id, ch.label, COUNT(rs.id) AS times_played,
            COALESCE(AVG(rs.strokes), 0.0) AS avg_strokes, COALESCE(AVG(rs.to_par), 0.0) AS avg_to_par
     FROM course_holes ch
     LEFT JOIN holes h ON h.course_hole_id = ch.id
     LEFT JOIN round_scores rs ON rs.hole_number = h.hole_number
       AND rs.round_id IN (SELECT r.id FROM rounds r WHERE r.layout_id = h.layout_id AND (?2 IS NULL OR r.player_name = ?2))
     WHERE ch.course_id = ?1 GROUP BY ch.id ORDER BY ch.label COLLATE NOCASE`,
    num(a, 'courseId'), optStr(a, 'playerName'),
  ).map(s => ({ ...s, layouts: layoutsForCourseHole(s.course_hole_id) })),
  get_course_hole_history: a => all(
    `SELECT r.date, rs.strokes, rs.to_par, l.name AS layout_name
     FROM round_scores rs
     JOIN rounds r ON r.id = rs.round_id
     JOIN holes h ON h.layout_id = r.layout_id AND h.hole_number = rs.hole_number
     JOIN layouts l ON l.id = r.layout_id
     WHERE h.course_hole_id = ?1 AND r.player_name = ?2 ORDER BY r.date ASC`,
    num(a, 'courseHoleId'), str(a, 'playerName'),
  ),
  add_layout_hole: a => {
    const layoutId = num(a, 'layoutId'), par = num(a, 'par'), courseHoleId = optNum(a, 'courseHoleId')
    const next = get<{ n: number }>('SELECT COALESCE(MAX(hole_number), 0) + 1 AS n FROM holes WHERE layout_id = ?1', layoutId)!.n
    run('INSERT INTO holes (layout_id, hole_number, par, course_hole_id) VALUES (?1, ?2, ?3, ?4)', layoutId, next, par, courseHoleId)
    const label = courseHoleId != null ? get<{ label: string }>('SELECT label FROM course_holes WHERE id = ?1', courseHoleId)?.label ?? null : null
    return { hole_number: next, par, course_hole_id: courseHoleId, course_hole_label: label }
  },
  remove_layout_hole: a => { run('DELETE FROM holes WHERE layout_id = ?1 AND hole_number = ?2', num(a, 'layoutId'), num(a, 'holeNumber')) },
  update_layout_hole_par: a => { run('UPDATE holes SET par = ?1 WHERE layout_id = ?2 AND hole_number = ?3', num(a, 'par'), num(a, 'layoutId'), num(a, 'holeNumber')) },
  /** Bytter et hul med naboen – også på allerede indtastede scores, så de følger den fysiske kurv. */
  move_layout_hole: a => {
    const layoutId = num(a, 'layoutId'), hole = num(a, 'holeNumber'), dir = str(a, 'direction')
    const numbers = all<{ hole_number: number }>('SELECT hole_number FROM holes WHERE layout_id = ?1 ORDER BY hole_number', layoutId).map(r => r.hole_number)
    const i = numbers.indexOf(hole)
    if (i < 0) throw new HttpError(404, 'Hul findes ikke på dette layout')
    if (dir !== 'up' && dir !== 'down') throw new HttpError(400, 'Ukendt retning')
    const other = dir === 'up' ? numbers[i - 1] : numbers[i + 1]
    if (other == null) return
    const SENTINEL = -1
    db.transaction(() => {
      for (const [from, to] of [[hole, SENTINEL], [other, hole], [SENTINEL, other]]) {
        run('UPDATE holes SET hole_number = ?3 WHERE layout_id = ?1 AND hole_number = ?2', layoutId, from, to)
      }
      for (const [from, to] of [[hole, SENTINEL], [other, hole], [SENTINEL, other]]) {
        run('UPDATE round_scores SET hole_number = ?2 WHERE hole_number = ?3 AND round_id IN (SELECT id FROM rounds WHERE layout_id = ?1)', layoutId, to, from)
      }
    })()
  },

  // ── Spiller ──
  get_player_summary: a => playerSummary(str(a, 'playerName')),
  get_player_rounds: a => playerRounds(str(a, 'playerName')),
  update_round_rating: a => { run('UPDATE rounds SET rating = ?1 WHERE id = ?2', optNum(a, 'rating'), num(a, 'roundId')) },
  export_player_json: a => buildPlayerExport(str(a, 'playerName')),
  get_player_badges: a => playerBadges(str(a, 'playerName')),
  /** Runder, hvor de to spillede samme layout samme dag. Lavest to_par vinder. */
  get_head_to_head: a => {
    const A = str(a, 'playerA'), B = str(a, 'playerB')
    const rows = all<{ date: string; course_name: string; layout_name: string; a_to_par: number; b_to_par: number }>(
      `SELECT r1.date, c.name AS course_name, l.name AS layout_name, r1.to_par AS a_to_par, r2.to_par AS b_to_par
       FROM rounds r1
       JOIN rounds r2 ON r2.layout_id = r1.layout_id AND r2.date = r1.date AND r2.player_name = ?2
       JOIN layouts l ON l.id = r1.layout_id JOIN courses c ON c.id = l.course_id
       WHERE r1.player_name = ?1 ORDER BY r1.date DESC`,
      A, B,
    )
    let a_wins = 0, b_wins = 0, ties = 0
    const rounds = rows.map(r => {
      const winner = r.a_to_par < r.b_to_par ? (a_wins++, A) : r.b_to_par < r.a_to_par ? (b_wins++, B) : (ties++, null)
      return { ...r, winner }
    })
    return { player_a: A, player_b: B, a_wins, b_wins, ties, rounds }
  },

  // ── Grupperunder ──
  get_sessions: () => all(
    `SELECT r.layout_id, c.name AS course_name, l.name AS layout_name, r.date, COUNT(*) AS player_count
     FROM rounds r JOIN layouts l ON l.id = r.layout_id JOIN courses c ON c.id = l.course_id
     GROUP BY r.layout_id, r.date HAVING COUNT(*) >= 2 ORDER BY r.date DESC`,
  ),
  get_session_detail: a => {
    const layoutId = num(a, 'layoutId'), date = str(a, 'date')
    const head = get<{ course_name: string; layout_name: string }>(
      'SELECT c.name AS course_name, l.name AS layout_name FROM layouts l JOIN courses c ON c.id = l.course_id WHERE l.id = ?1', layoutId,
    )
    if (!head) throw notFound('Layoutet')
    const rows = all<{ player_name: string; total_score: number; to_par: number; rating: number | null }>(
      'SELECT player_name, total_score, to_par, rating FROM rounds WHERE layout_id = ?1 AND date = ?2 ORDER BY to_par ASC, total_score ASC', layoutId, date,
    )
    // Konkurrence-rangering: samme to_par giver samme placering (1, 1, 3)
    let placement = 0
    let prev: number | null = null
    const results = rows.map((r, i) => {
      if (prev !== r.to_par) {
        placement = i + 1
        prev = r.to_par
      }
      return { ...r, placement }
    })
    return { ...head, date, results }
  },

  // ── Diske ──
  get_discs: () => all<DiscRow>(`SELECT ${DISC_COLUMNS} FROM discs ORDER BY in_bag DESC, category, name COLLATE NOCASE`).map(disc),
  create_disc: a => {
    const { id } = get<{ id: number }>(
      `INSERT INTO discs (name, brand, mold, category, color, in_bag, speed, glide, turn, fade, weight_grams, plastic, condition, notes,
         holder, lost, skill_levels, best_wind, best_weather, stability, acquired_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ...discValues(a.input ?? {}),
    )!
    return disc(get<DiscRow>(`SELECT ${DISC_COLUMNS} FROM discs WHERE id = ?1`, id)!)
  },
  update_disc: a => {
    run(
      `UPDATE discs SET name = ?, brand = ?, mold = ?, category = ?, color = ?, in_bag = ?, speed = ?, glide = ?, turn = ?, fade = ?,
         weight_grams = ?, plastic = ?, condition = ?, notes = ?, holder = ?, lost = ?, skill_levels = ?, best_wind = ?, best_weather = ?,
         stability = ?, acquired_date = ? WHERE id = ?`,
      ...discValues(a.input ?? {}), num(a, 'discId'),
    )
  },
  delete_disc: a => {
    const id = num(a, 'discId')
    const img = imagePath(id)
    run('DELETE FROM discs WHERE id = ?1', id)
    removeImage(img)
  },
  /** Hele diskkartoteket som JSON (til en LLM). */
  export_discs_json: () => all<DiscRow>(`SELECT ${DISC_COLUMNS} FROM discs ORDER BY category, name COLLATE NOCASE`).map(disc)
    .map(({ id: _id, image_path, ...d }) => ({ ...d, has_image: !!image_path })),
  /** Billedet sendes som data-URL. */
  set_disc_image: async a => {
    const id = num(a, 'discId')
    const m = /^data:image\/(jpeg|jpg|png|gif|webp|bmp);base64,(.+)$/.exec(str(a, 'image'))
    if (!m) throw new HttpError(400, 'Ugyldigt billede')
    const bytes = Buffer.from(m[2], 'base64')
    if (bytes.length > 8 * 1024 * 1024) throw new HttpError(413, 'Billedet er for stort (max 8 MB)')
    const old = imagePath(id)
    const file = `${id}_${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    await Bun.write(join(IMAGES, file), bytes)
    run('UPDATE discs SET image_path = ?1 WHERE id = ?2', file, id)
    removeImage(old)
  },
  remove_disc_image: a => {
    const id = num(a, 'discId')
    const old = imagePath(id)
    run('UPDATE discs SET image_path = NULL WHERE id = ?1', id)
    removeImage(old)
  },
  get_disc_image_data_url: async a => {
    const file = imagePath(num(a, 'discId'))
    if (!file || !existsSync(join(IMAGES, basename(file)))) return null
    const ext = file.split('.').pop()!.toLowerCase()
    const b64 = Buffer.from(await Bun.file(join(IMAGES, basename(file))).arrayBuffer()).toString('base64')
    return `data:${MIME[ext] ?? 'image/png'};base64,${b64}`
  },

  // ── Runder ──
  get_round_holes: a => roundHoleScores(num(a, 'roundId')),
  update_round_hole_score: a => {
    const roundId = num(a, 'roundId')
    run('UPDATE round_scores SET strokes = ?1, to_par = ?1 - par WHERE round_id = ?2 AND hole_number = ?3', num(a, 'strokes'), roundId, num(a, 'holeNumber'))
    return recalculateRound(roundId)
  },
  delete_round_hole_score: a => {
    const roundId = num(a, 'roundId')
    run('DELETE FROM round_scores WHERE round_id = ?1 AND hole_number = ?2', roundId, num(a, 'holeNumber'))
    return recalculateRound(roundId)
  },
  get_round_discs: a => all<{ disc_id: number }>('SELECT disc_id FROM round_discs WHERE round_id = ?1', num(a, 'roundId')).map(r => r.disc_id),
  set_round_discs: a => {
    const roundId = num(a, 'roundId')
    db.transaction(() => {
      run('DELETE FROM round_discs WHERE round_id = ?1', roundId)
      for (const d of (a.discIds ?? []) as number[]) run('INSERT INTO round_discs (round_id, disc_id) VALUES (?1, ?2)', roundId, d)
    })()
  },
  get_round_conditions: a => roundConditions(num(a, 'roundId')),
  set_round_conditions: a => { run('UPDATE rounds SET wind = ?1, weather = ?2 WHERE id = ?3', optStr(a, 'wind'), optStr(a, 'weather'), num(a, 'roundId')) },

  // ── Eksport og backup ──
  export_all_json: () => players().map(buildPlayerExport),
  /** Alle DiskMates tabeller som JSON (erstatter kopien af databasefilen i Tauri-udgaven). */
  backup_database: () => {
    const tables = ['courses', 'layouts', 'course_holes', 'holes', 'rounds', 'round_scores', 'discs', 'round_discs']
    return { app: 'diskmate', version: 1, exported_at: new Date().toISOString(), tables: Object.fromEntries(tables.map(t => [t, all(`SELECT * FROM ${t}`)])) }
  },
}

/** Til importscriptet fra Tauri-udgaven. */
export { backfillCourseHoles }
