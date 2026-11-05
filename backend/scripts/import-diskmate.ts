/**
 * Importerer data fra den gamle Tauri-udgave af DiskMate (diskmate.sqlite + disc_images) til Mates-databasen.
 *
 *   bun run import-diskmate ../import/diskmate.sqlite [../import/disc_images]
 *
 * Skemaet er næsten identisk – diskmate_*-tabellerne har samme kolonner som den gamle app,
 * minus nogle felter, der ikke er en del af porteringen (tee_color, metrix_score, caddie-noter
 * og sessionsvejr). Disk-billederne ligger som filer ved siden af den gamle database (angivet
 * med anden sti end image_path pegede på i Tauri-udgaven) og kopieres ind i data/diskmate-billeder/.
 * Scriptet kan køres flere gange – baner, layouts, huller, runder og runde-scores har de samme
 * unikke nøgler som i den nye database, så de springes automatisk over ved gensyn. Diske matches
 * på navn (ingen stabil reference i den gamle database).
 */
import { Database } from 'bun:sqlite'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DB_PATH } from '../src/db'
import { get, run } from '../src/mates/diskmate/sql'

const path = process.argv[2]
if (!path) {
  console.error('Angiv stien til den gamle diskmate.sqlite')
  process.exit(1)
}
const imagesSrc = process.argv[3] ?? join(dirname(path), 'disc_images')

const IMAGES = join(dirname(DB_PATH), 'diskmate-billeder')
mkdirSync(IMAGES, { recursive: true })

// Åbner den gamle database direkte (sql.ts' hjælpere peger på vores egen db og præfikser tabelnavne).
const old = new Database(path, { readonly: true })
const oldAll = <T>(sql: string) => old.query(sql).all() as T[]

interface OldCourse { id: number; name: string }
interface OldLayout { id: number; course_id: number; name: string; hole_count: number }
interface OldCourseHole { id: number; course_id: number; label: string }
interface OldHole { id: number; layout_id: number; hole_number: number; par: number; course_hole_id: number | null }
interface OldRound {
  id: number; layout_id: number; player_name: string; date: string
  total_score: number; total_par: number; to_par: number; rating: number | null; wind: string | null; weather: string | null
}
interface OldRoundScore { round_id: number; hole_number: number; strokes: number; par: number; to_par: number }
interface OldDisc {
  id: number; name: string; brand: string | null; mold: string | null; category: string; color: string | null; in_bag: number
  speed: number | null; glide: number | null; turn: number | null; fade: number | null; weight_grams: number | null
  plastic: string | null; condition: string | null; notes: string | null; image_path: string | null; holder: string | null
  lost: number; skill_levels: string | null; best_wind: string | null; best_weather: string | null; stability: string | null; acquired_date: string | null
}
interface OldRoundDisc { round_id: number; disc_id: number }

const courseIdByOldId = new Map<number, number>()
for (const c of oldAll<OldCourse>('SELECT id, name FROM courses')) {
  run('INSERT INTO courses (name) VALUES (?) ON CONFLICT(name) DO NOTHING', c.name)
  courseIdByOldId.set(c.id, get<{ id: number }>('SELECT id FROM courses WHERE name = ?', c.name)!.id)
}

const layoutIdByOldId = new Map<number, number>()
for (const l of oldAll<OldLayout>('SELECT id, course_id, name, hole_count FROM layouts')) {
  const courseId = courseIdByOldId.get(l.course_id)!
  run('INSERT INTO layouts (course_id, name, hole_count) VALUES (?, ?, ?) ON CONFLICT(course_id, name) DO NOTHING', courseId, l.name, l.hole_count)
  layoutIdByOldId.set(l.id, get<{ id: number }>('SELECT id FROM layouts WHERE course_id = ? AND name = ?', courseId, l.name)!.id)
}

// course_holes har ingen unik-begrænsning, så vi tjekker selv for et gensyn.
const courseHoleIdByOldId = new Map<number, number>()
for (const ch of oldAll<OldCourseHole>('SELECT id, course_id, label FROM course_holes')) {
  const courseId = courseIdByOldId.get(ch.course_id)!
  let row = get<{ id: number }>('SELECT id FROM course_holes WHERE course_id = ? AND label = ?', courseId, ch.label)
  if (!row) row = get<{ id: number }>('INSERT INTO course_holes (course_id, label) VALUES (?, ?) RETURNING id', courseId, ch.label)
  courseHoleIdByOldId.set(ch.id, row!.id)
}

for (const h of oldAll<OldHole>('SELECT id, layout_id, hole_number, par, course_hole_id FROM holes')) {
  const layoutId = layoutIdByOldId.get(h.layout_id)!
  const courseHoleId = h.course_hole_id != null ? courseHoleIdByOldId.get(h.course_hole_id) ?? null : null
  run(
    'INSERT INTO holes (layout_id, hole_number, par, course_hole_id) VALUES (?, ?, ?, ?) ON CONFLICT(layout_id, hole_number) DO NOTHING',
    layoutId, h.hole_number, h.par, courseHoleId,
  )
}

let roundsImported = 0
const roundIdByOldId = new Map<number, number>()
for (const r of oldAll<OldRound>('SELECT id, layout_id, player_name, date, total_score, total_par, to_par, rating, wind, weather FROM rounds')) {
  const layoutId = layoutIdByOldId.get(r.layout_id)!
  let row = get<{ id: number }>('SELECT id FROM rounds WHERE layout_id = ? AND player_name = ? AND date = ?', layoutId, r.player_name, r.date)
  if (!row) {
    row = get<{ id: number }>(
      `INSERT INTO rounds (layout_id, player_name, date, total_score, total_par, to_par, rating, wind, weather)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      layoutId, r.player_name, r.date, r.total_score, r.total_par, r.to_par, r.rating, r.wind, r.weather,
    )
    roundsImported++
  }
  roundIdByOldId.set(r.id, row!.id)
}

let scoresImported = 0
for (const s of oldAll<OldRoundScore>('SELECT round_id, hole_number, strokes, par, to_par FROM round_scores')) {
  const roundId = roundIdByOldId.get(s.round_id)
  if (roundId == null) continue
  const res = run(
    'INSERT INTO round_scores (round_id, hole_number, strokes, par, to_par) VALUES (?, ?, ?, ?, ?) ON CONFLICT(round_id, hole_number) DO NOTHING',
    roundId, s.hole_number, s.strokes, s.par, s.to_par,
  )
  if (res.changes) scoresImported++
}

const DISC_COLS = `name, brand, mold, category, color, in_bag, speed, glide, turn, fade, weight_grams, plastic, condition, notes,
  holder, lost, skill_levels, best_wind, best_weather, stability, acquired_date`
let discsImported = 0, imagesCopied = 0
const discIdByOldId = new Map<number, number>()
for (const d of oldAll<OldDisc>(
  `SELECT id, name, brand, mold, category, color, in_bag, speed, glide, turn, fade, weight_grams, plastic, condition, notes,
     image_path, holder, lost, skill_levels, best_wind, best_weather, stability, acquired_date FROM discs`,
)) {
  let row = get<{ id: number }>('SELECT id FROM discs WHERE name = ?', d.name)
  if (!row) {
    row = get<{ id: number }>(
      `INSERT INTO discs (${DISC_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      d.name, d.brand, d.mold, d.category, d.color, d.in_bag, d.speed, d.glide, d.turn, d.fade, d.weight_grams,
      d.plastic, d.condition, d.notes, d.holder, d.lost, d.skill_levels, d.best_wind, d.best_weather, d.stability, d.acquired_date,
    )
    discsImported++

    if (d.image_path) {
      const file = basename(d.image_path)
      const src = join(imagesSrc, file)
      const dest = join(IMAGES, file)
      if (existsSync(src)) {
        if (!existsSync(dest)) copyFileSync(src, dest)
        run('UPDATE discs SET image_path = ? WHERE id = ?', file, row!.id)
        imagesCopied++
      } else {
        console.warn(`Billedet "${file}" til "${d.name}" findes ikke i ${imagesSrc} – springes over`)
      }
    }
  }
  discIdByOldId.set(d.id, row!.id)
}

let roundDiscsImported = 0
for (const rd of oldAll<OldRoundDisc>('SELECT round_id, disc_id FROM round_discs')) {
  const roundId = roundIdByOldId.get(rd.round_id)
  const discId = discIdByOldId.get(rd.disc_id)
  if (roundId == null || discId == null) continue
  const res = run('INSERT INTO round_discs (round_id, disc_id) VALUES (?, ?) ON CONFLICT(round_id, disc_id) DO NOTHING', roundId, discId)
  if (res.changes) roundDiscsImported++
}

console.log(
  `Importerede ${roundsImported} nye runder, ${scoresImported} hul-scores, ${discsImported} diske (${imagesCopied} billeder) og ${roundDiscsImported} diske-pr-runde.`,
)
