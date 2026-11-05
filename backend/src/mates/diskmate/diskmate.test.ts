import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCsv } from './csv'

// Testene kører mod en tom database i en midlertidig mappe
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'diskmate-')), 'test.sqlite')
let commands: Record<string, (a: Record<string, unknown>) => any>
beforeAll(async () => {
  commands = (await import('./commands')).commands
})
const call = async (cmd: string, args: Record<string, unknown> = {}) => commands[cmd](args)

const CSV = [
  'PlayerName,CourseName,LayoutName,StartDate,EndDate,Total,+/-,RoundRating,Hole1,Hole2,Hole3',
  'Par,"Skovbanen, Aarhus",Rød,2026-05-01 10:00,2026-05-01 11:00,9,,,3,3,3',
  'Nicki,"Skovbanen, Aarhus",Rød,2026-05-01 10:00,2026-05-01 11:00,8,-1,210,2,3,3',
  'Solveig,"Skovbanen, Aarhus",Rød,2026-05-01 10:00,2026-05-01 11:00,11,2,,4,4,3',
].join('\n')

describe('csv', () => {
  test('citerede felter med komma', () => {
    expect(parseCsv('a,b\n"x, y","sagde ""hej"""\n')).toEqual([['a', 'b'], ['x, y', 'sagde "hej"']])
  })
})

describe('UDisc-import', () => {
  test('importerer par og runder, og springer dubletter over', async () => {
    expect(await call('import_csv', { content: CSV })).toEqual({ imported_rounds: 2, skipped_duplicates: 0 })
    expect(await call('import_csv', { content: CSV })).toEqual({ imported_rounds: 0, skipped_duplicates: 2 })
    expect(await call('get_players')).toEqual(['Nicki', 'Solveig'])
    const [stat] = await call('get_course_stats', { playerName: 'Nicki' })
    expect(stat).toMatchObject({ course_name: 'Skovbanen, Aarhus', layout_name: 'Rød', hole_count: 3, rounds_played: 1, best_to_par: -1 })
  })

  test('grupperunde med placering', async () => {
    const [s] = await call('get_sessions')
    const d = await call('get_session_detail', { layoutId: s.layout_id, date: s.date })
    expect(d.results.map((r: any) => [r.player_name, r.placement])).toEqual([['Nicki', 1], ['Solveig', 2]])
  })

  test('rettelse af et hul genberegner runden', async () => {
    const [r] = await call('get_player_rounds', { playerName: 'Nicki' })
    expect(await call('update_round_hole_score', { roundId: r.round_id, holeNumber: 1, strokes: 3 })).toEqual({ total_score: 9, total_par: 9, to_par: 0 })
  })

  test('flyt hul bytter også indtastede scores', async () => {
    const [stat] = await call('get_course_stats', { playerName: null })
    const before = await call('get_hole_stats', { layoutId: stat.layout_id, playerName: 'Solveig' })
    await call('move_layout_hole', { layoutId: stat.layout_id, holeNumber: 1, direction: 'down' })
    const after = await call('get_hole_stats', { layoutId: stat.layout_id, playerName: 'Solveig' })
    expect(after[1].avg_strokes).toBe(before[0].avg_strokes)
    expect(after[0].avg_strokes).toBe(before[1].avg_strokes)
  })

  test('badges og head-to-head', async () => {
    const board = await call('get_player_badges', { playerName: 'Nicki' })
    expect(board.badges.find((b: any) => b.id === 'rounds_1').achieved).toBe(true)
    const h2h = await call('get_head_to_head', { playerA: 'Nicki', playerB: 'Solveig' })
    expect([h2h.a_wins, h2h.b_wins, h2h.ties]).toEqual([1, 0, 0])
  })

  test('manglende kolonner giver en forståelig fejl', async () => {
    expect(() => commands.import_csv({ content: 'Foo,Bar\n1,2' })).toThrow("Mangler kolonnen 'PlayerName'")
  })
})
