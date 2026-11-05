import { db } from '../../db'
import { HttpError } from '../../lib/http'
import { parseCsv } from './csv'
import { all, get, run } from './sql'

/** Giver hvert layout-hul uden fysisk hul sit eget (ukoblede) fysiske hul. */
export function backfillCourseHoles() {
  const rows = all<{ id: number; course_id: number; hole_number: number }>(
    `SELECT h.id, l.course_id, h.hole_number FROM holes h JOIN layouts l ON l.id = h.layout_id WHERE h.course_hole_id IS NULL`,
  )
  for (const r of rows) {
    const { id } = get<{ id: number }>('INSERT INTO course_holes (course_id, label) VALUES (?, ?) RETURNING id', r.course_id, `Hul ${r.hole_number}`)!
    run('UPDATE holes SET course_hole_id = ? WHERE id = ?', id, r.id)
  }
}

function upsertCourseAndLayout(course: string, layout: string, holeCount: number) {
  run('INSERT INTO courses (name) VALUES (?) ON CONFLICT(name) DO NOTHING', course)
  const courseId = get<{ id: number }>('SELECT id FROM courses WHERE name = ?', course)!.id
  run(
    `INSERT INTO layouts (course_id, name, hole_count) VALUES (?, ?, ?)
     ON CONFLICT(course_id, name) DO UPDATE SET hole_count = excluded.hole_count`,
    courseId, layout, holeCount,
  )
  return get<{ id: number }>('SELECT id FROM layouts WHERE course_id = ? AND name = ?', courseId, layout)!.id
}

/**
 * Importerer en UDisc-scorecard-eksport (CSV). En "Par"-række definerer layoutets huller;
 * øvrige rækker er spilleres runder. Runder, der allerede findes (samme layout, spiller og dato), springes over.
 * Huller, der allerede findes, røres ikke, så manuelle rettelser i layout-administrationen bevares.
 */
export function importCsv(text: string) {
  const [headers, ...records] = parseCsv(text)
  if (!headers) throw new HttpError(422, 'Filen er tom')
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.trim().toLowerCase() === n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }
  const need = (label: string, ...names: string[]) => {
    const i = idx(...names)
    if (i < 0) throw new HttpError(422, `Mangler kolonnen '${label}'`)
    return i
  }
  const iPlayer = need('PlayerName', 'PlayerName')
  const iCourse = need('DGCourseName', 'DGCourseName', 'CourseName')
  const iLayout = need('LayoutName', 'LayoutName')
  const iDate = need('StartDate', 'StartDate', 'Date')
  const iRating = idx('RoundRating', 'Rating')
  const holeCols = headers
    .map((h, i) => [i, /^hole\s*0*([0-9]+)$/i.exec(h.trim())?.[1]] as const)
    .filter((x): x is readonly [number, string] => !!x[1])
    .map(([i, n]) => [i, Number(n)] as const)
  if (!holeCols.length) throw new HttpError(422, "Ingen 'HoleN'-kolonner fundet i CSV-filen")

  const int = (v: string | undefined) => (v != null && /^\s*-?\d+\s*$/.test(v) ? Number(v) : null)

  return db.transaction(() => {
    let imported = 0
    let skipped = 0
    const layoutIds = new Map<string, number>()
    const layoutPars = new Map<number, Map<number, number>>()

    for (const rec of records) {
      const player = (rec[iPlayer] ?? '').trim()
      const course = (rec[iCourse] ?? '').trim()
      const layout = (rec[iLayout] ?? '').trim()
      const date = (rec[iDate] ?? '').trim()
      if (!player || !course || !layout) continue
      const values = holeCols.map(([i, n]) => [n, int(rec[i])] as const).filter((x): x is readonly [number, number] => x[1] !== null)
      if (!values.length) continue
      const key = `${course}\u0000${layout}`

      if (player.toLowerCase() === 'par') {
        const layoutId = upsertCourseAndLayout(course, layout, values.length)
        const pars = new Map<number, number>()
        for (const [hole, par] of values) {
          run('INSERT OR IGNORE INTO holes (layout_id, hole_number, par) VALUES (?, ?, ?)', layoutId, hole, par)
          pars.set(hole, get<{ par: number }>('SELECT par FROM holes WHERE layout_id = ? AND hole_number = ?', layoutId, hole)!.par)
        }
        layoutIds.set(key, layoutId)
        layoutPars.set(layoutId, pars)
        continue
      }

      let layoutId = layoutIds.get(key)
      if (layoutId == null) {
        layoutId = upsertCourseAndLayout(course, layout, values.length)
        layoutIds.set(key, layoutId)
      }
      let pars = layoutPars.get(layoutId)
      if (!pars) {
        pars = new Map(all<{ hole_number: number; par: number }>('SELECT hole_number, par FROM holes WHERE layout_id = ?', layoutId).map(h => [h.hole_number, h.par]))
        layoutPars.set(layoutId, pars)
      }

      const totalScore = values.reduce((s, [, v]) => s + v, 0)
      const totalPar = values.reduce((s, [h]) => s + (pars!.get(h) ?? 0), 0)
      const rating = iRating >= 0 ? int(rec[iRating]) : null
      const res = run(
        `INSERT OR IGNORE INTO rounds (layout_id, player_name, date, total_score, total_par, to_par, rating) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        layoutId, player, date, totalScore, totalPar, totalScore - totalPar, rating,
      )
      if (!res.changes) {
        skipped++
        continue
      }
      const roundId = Number(res.lastInsertRowid)
      for (const [hole, strokes] of values) {
        const par = pars.get(hole) ?? 0
        run('INSERT OR IGNORE INTO round_scores (round_id, hole_number, strokes, par, to_par) VALUES (?, ?, ?, ?, ?)', roundId, hole, strokes, par, strokes - par)
      }
      imported++
    }
    backfillCourseHoles()
    return { imported_rounds: imported, skipped_duplicates: skipped }
  })()
}
