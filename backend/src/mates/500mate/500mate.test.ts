import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), '500mate-')), 'test.sqlite')

let scoring: typeof import('./scoring')
let q: typeof import('./queries')

beforeAll(async () => {
  scoring = await import('./scoring')
  q = await import('./queries')
})

describe('scoring', () => {
  test('kontraktVaerdi: basisværdi + 100 pr. niveau over 6', () => {
    expect(scoring.kontraktVaerdi('spar', 6)).toBe(40)
    expect(scoring.kontraktVaerdi('spar', 7)).toBe(140)
    expect(scoring.kontraktVaerdi('sans', 10)).toBe(520)
  })

  test('beregnMelderPoint: holdt kontrakt giver positiv værdi', () => {
    expect(scoring.beregnMelderPoint('spar', 6, 6)).toBe(40)
    expect(scoring.beregnMelderPoint('spar', 6, 8)).toBe(40)
  })

  test('beregnMelderPoint: ikke holdt kontrakt giver negativ værdi', () => {
    expect(scoring.beregnMelderPoint('spar', 6, 5)).toBe(-40)
    expect(scoring.beregnMelderPoint('hjerte', 8, 7)).toBe(-300)
  })

  test('beregnMelderPoint: grand slam (10 stik) bunder i mindst 250', () => {
    expect(scoring.beregnMelderPoint('spar', 6, 10)).toBe(250)
    expect(scoring.beregnMelderPoint('sans', 10, 10)).toBe(520) // allerede over 250
  })

  test('beregnMelderPoint: nullo er fast ±250 uanset antal', () => {
    expect(scoring.beregnMelderPoint('nullo', 0, 0)).toBe(250)
    expect(scoring.beregnMelderPoint('nullo', 0, 1)).toBe(-250)
  })

  test('beregnModspillerPoint: 10 point pr. stik', () => {
    expect(scoring.beregnModspillerPoint(0)).toBe(0)
    expect(scoring.beregnModspillerPoint(7)).toBe(70)
  })

  test('ukendt farve kaster en fejl', () => {
    expect(() => scoring.kontraktVaerdi('diamant', 6)).toThrow('Ukendt farve')
  })
})

describe('spillere', () => {
  test('oprettes, opdateres og deaktiveres (soft delete)', () => {
    const p = q.createPlayer('Mads', '#ff0000')
    expect(p.navn).toBe('Mads')
    expect(q.listActivePlayers().some(x => x.id === p.id)).toBe(true)

    q.updatePlayer(p.id, 'Mads Jensen', '#00ff00')
    expect(q.listActivePlayers().find(x => x.id === p.id)?.navn).toBe('Mads Jensen')

    q.deactivatePlayer(p.id)
    expect(q.listActivePlayers().some(x => x.id === p.id)).toBe(false)
  })

  test('to spillere med samme navn afvises', () => {
    q.createPlayer('Unik', '#111111')
    expect(() => q.createPlayer('Unik', '#222222')).toThrow('findes allerede')
  })
})

function seedPlayers(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => q.createPlayer(`${prefix}${i}`, '#000000').id)
}

describe('spil og runder', () => {
  test('et spil kræver mindst 3 spillere', () => {
    const ids = seedPlayers(2, 'KunTo')
    expect(() => q.createGame('Test', '2026-01-01', ids)).toThrow('mindst 3 spillere')
  })

  test('runde: stik skal summere til 10', () => {
    const ids = seedPlayers(3, 'Sum')
    const game = q.createGame('Sumspil', '2026-01-01', ids)
    expect(() =>
      q.addRound(game.id, { points: ids.map(player_id => ({ player_id, stik_vundet: 1 })) }),
    ).toThrow('summere til 10')
  })

  test('runde uden melding: alle får 10 point pr. stik', () => {
    const ids = seedPlayers(3, 'Mod')
    const game = q.createGame('Modspil', '2026-01-01', ids)
    const runde = q.addRound(game.id, {
      points: [
        { player_id: ids[0], stik_vundet: 4 },
        { player_id: ids[1], stik_vundet: 3 },
        { player_id: ids[2], stik_vundet: 3 },
      ],
    })
    expect(runde.points.find(p => p.player_id === ids[0])?.point).toBe(40)
    expect(runde.points.find(p => p.player_id === ids[1])?.point).toBe(30)
  })

  test('runde med melding: melder får melder-point, resten modspiller-point', () => {
    const ids = seedPlayers(3, 'Meld')
    const game = q.createGame('Meldspil', '2026-01-01', ids)
    const runde = q.addRound(game.id, {
      melding_spiller_id: ids[0],
      melding_antal: 6,
      melding_farve: 'spar',
      points: [
        { player_id: ids[0], stik_vundet: 6 },
        { player_id: ids[1], stik_vundet: 2 },
        { player_id: ids[2], stik_vundet: 2 },
      ],
    })
    expect(runde.points.find(p => p.player_id === ids[0])?.point).toBe(40) // meldte og holdt
    expect(runde.points.find(p => p.player_id === ids[1])?.point).toBe(20) // modspiller: 2*10
  })

  test('ugyldig melding (antal uden for 6-10) afvises', () => {
    const ids = seedPlayers(3, 'Ugyld')
    const game = q.createGame('Ugyldigt', '2026-01-01', ids)
    expect(() =>
      q.addRound(game.id, {
        melding_spiller_id: ids[0],
        melding_antal: 3,
        melding_farve: 'spar',
        points: [
          { player_id: ids[0], stik_vundet: 6 },
          { player_id: ids[1], stik_vundet: 2 },
          { player_id: ids[2], stik_vundet: 2 },
        ],
      }),
    ).toThrow('mellem 6 og 10')
  })

  test('afslut_spil kårer spilleren med flest point som vinder', () => {
    const ids = seedPlayers(3, 'Vind')
    const game = q.createGame('Vinderspil', '2026-01-01', ids)
    q.addRound(game.id, {
      melding_spiller_id: ids[1],
      melding_antal: 8,
      melding_farve: 'sans',
      points: [
        { player_id: ids[0], stik_vundet: 1 },
        { player_id: ids[1], stik_vundet: 8 },
        { player_id: ids[2], stik_vundet: 1 },
      ],
    })
    const afsluttet = q.finishGame(game.id)
    expect(afsluttet.afsluttet).toBe(1)
    expect(afsluttet.vinder_id).toBe(ids[1])
  })

  test('et afsluttet spil kan ikke få flere runder', () => {
    const ids = seedPlayers(3, 'Lukket')
    const game = q.createGame('Lukket spil', '2026-01-01', ids)
    q.finishGame(game.id)
    expect(() => q.addRound(game.id, { points: ids.map(player_id => ({ player_id, stik_vundet: 3 })) })).toThrow('afsluttet')
  })

  test('totaler akkumuleres korrekt på tværs af runder', () => {
    const ids = seedPlayers(3, 'Kum')
    const game = q.createGame('Kumulativt', '2026-01-01', ids)
    q.addRound(game.id, { points: ids.map(player_id => ({ player_id, stik_vundet: player_id === ids[0] ? 4 : 3 })) })
    q.addRound(game.id, { points: ids.map(player_id => ({ player_id, stik_vundet: player_id === ids[0] ? 4 : 3 })) })
    const totaler = q.totalerForGame(game.id)
    expect(totaler.length).toBe(2)
    expect(totaler[1].totaler.find(t => t.player_id === ids[0])?.kumulativt).toBe(80)
  })
})

describe('leaderboard', () => {
  test('tæller sejre, bedste spil og grand slams', () => {
    const ids = seedPlayers(3, 'Board')
    const game = q.createGame('Boardspil', '2026-01-01', ids)
    q.addRound(game.id, {
      melding_spiller_id: ids[0],
      melding_antal: 6,
      melding_farve: 'spar',
      points: [
        { player_id: ids[0], stik_vundet: 10 }, // grand slam
        { player_id: ids[1], stik_vundet: 0 },
        { player_id: ids[2], stik_vundet: 0 },
      ],
    })
    q.finishGame(game.id)

    const board = q.leaderboard()
    const row = board.find(r => r.player_id === ids[0])!
    expect(row.sejre).toBe(1)
    expect(row.grand_slams).toBe(1)
    expect(row.bedste_spil).toBe(250)
    expect(row.kontrakt_forsoegt).toBe(1)
    expect(row.kontrakt_vundet).toBe(1)
  })
})
