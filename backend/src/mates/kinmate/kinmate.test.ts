import { describe, expect, test } from 'bun:test'
import { findDubletter, inversRelation, relationForslag, relationGruppe, type RelLike } from './relations'
import { exportGedcom, gedcomDato, gedcomNavn, parseGedcom, parseGedcomDato } from './gedcom'

describe('relationer', () => {
  test('grupper, også sted-typer og den gamle stavefejl', () => {
    expect(relationGruppe('stedfar')).toBe('forældre')
    expect(relationGruppe('steddatter')).toBe('barn')
    expect(relationGruppe('stedsøster')).toBe('søskende')
    expect(relationGruppe('steffar')).toBe('ukendt')
    expect(relationGruppe('farfar')).toBe('bedsteforældre')
  })

  test('invers bruger modpartens køn', () => {
    expect(inversRelation('far', 'mand')).toBe('søn')
    expect(inversRelation('far', 'kvinde')).toBe('datter')
    expect(inversRelation('far', '')).toBeNull()
    expect(inversRelation('gift', null)).toBe('gift')
    expect(inversRelation('stedmor', 'mand')).toBe('stedsøn')
    expect(inversRelation('morfar', null)).toBe('barnebarn')
    expect(inversRelation('barnebarn', 'mand')).toBeNull()
  })

  const rel = (id: string, p1: string, p2: string, type_: string): RelLike =>
    ({ id, person1_id: p1, person1_navn: p1.toUpperCase(), person2_id: p2, person2_navn: p2.toUpperCase(), type_ })

  test('dubletter er samme par i samme gruppe', () => {
    const d = findDubletter([rel('1', 'a', 'b', 'far'), rel('2', 'b', 'a', 'søn'), rel('3', 'a', 'b', 'stedfar')])
    expect(d).toHaveLength(1)
    expect(d[0].id1).toBe('1')
    expect(d[0].id2).toBe('3')
  })

  test('forslag: søskende, bedsteforældre og partner', () => {
    const relations = [
      rel('1', 'far', 'a', 'far'), rel('2', 'far', 'b', 'far'),
      rel('3', 'mor', 'a', 'mor'), rel('4', 'mor', 'b', 'mor'),
      rel('5', 'farfar', 'far', 'far'),
    ]
    const køn = new Map<string, string>([['a', 'mand'], ['b', 'kvinde'], ['far', 'mand'], ['mor', 'kvinde'], ['farfar', 'mand']])
    const f = relationForslag(relations, køn)
    const has = (p1: string, p2: string, type: string) => f.some(x => x.person1_id === p1 && x.person2_id === p2 && x.type_ === type)
    expect(has('a', 'b', 'bror')).toBe(true)
    expect(has('b', 'a', 'søster')).toBe(true)
    expect(has('far', 'mor', 'partner')).toBe(true)
    expect(has('farfar', 'a', 'farfar')).toBe(true)
    expect(has('a', 'farfar', 'barnebarn')).toBe(true)
    // Eksisterende relationer foreslås ikke igen
    expect(has('far', 'a', 'far')).toBe(false)
  })
})

describe('gedcom', () => {
  test('navne og datoer', () => {
    expect(gedcomNavn('Anna Marie Hansen')).toBe('Anna Marie /Hansen/')
    expect(gedcomDato('1890-03-05')).toBe('5 MAR 1890')
    expect(gedcomDato('1890-03')).toBe('MAR 1890')
    expect(gedcomDato('1890')).toBe('1890')
    expect(parseGedcomDato('ABT 5 MAR 1890')).toBe('1890-03-05')
    expect(parseGedcomDato('MAR 1890')).toBe('1890-03')
    expect(parseGedcomDato('1890')).toBe('1890')
  })

  test('eksport og import giver de samme personer og forældrerelationer', () => {
    const personer = [
      { id: 'f', navn: 'Hans Jensen', køn: 'mand', fødselsdato: '1900-01-02', fødselsogn: 'Ribe', dødsdato: null, dødssogn: null },
      { id: 'm', navn: 'Karen Jensen', køn: 'kvinde', fødselsdato: null, fødselsogn: null, dødsdato: '1980', dødssogn: null },
      { id: 'b', navn: 'Ole Jensen', køn: 'mand', fødselsdato: null, fødselsogn: null, dødsdato: null, dødssogn: null },
    ]
    const ged = exportGedcom(personer, [
      { person1_id: 'f', person2_id: 'b', type: 'far' },
      { person1_id: 'm', person2_id: 'b', type: 'mor' },
      { person1_id: 'f', person2_id: 'm', type: 'gift' },
    ])
    const imp = parseGedcom(ged)
    expect(imp.personer.map(p => p.navn)).toEqual(['Hans Jensen', 'Karen Jensen', 'Ole Jensen'])
    expect(imp.personer[0].fødselsdato).toBe('1900-01-02')
    expect(imp.personer[0].fødselsogn).toBe('Ribe')
    const typer = imp.relationer.map(r => r.type).sort()
    expect(typer).toEqual(['far', 'gift', 'gift', 'mor', 'søn', 'søn'])
    expect(imp.advarsler).toEqual([])
  })
})
