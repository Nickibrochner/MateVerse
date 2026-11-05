/**
 * Kinmates relations-taksonomi og -logik – rene funktioner, oversat fra Tauri-udgavens Rust-kode.
 * Frontendens `mates/kinmate/relationTypes.ts` har ordlisten til visning; hold dem i sync.
 */

export type Køn = 'mand' | 'kvinde' | string

const GRUPPER: Record<string, string[]> = {
  'forældre': ['far', 'mor', 'adoptivfar', 'adoptivmor', 'plejefar', 'plejemor', 'stedfar', 'stedmor'],
  'barn': ['søn', 'datter', 'plejesøn', 'plejedatter', 'stedsøn', 'steddatter'],
  'partner': ['gift', 'partner', 'skilt', 'enkemand', 'enke'],
  'søskende': ['bror', 'søster', 'halvbror', 'halvsøster', 'stedbror', 'stedsøster', 'plejebror', 'plejesøster'],
  'svigerforældre': ['svigerfar', 'svigermor'],
  'svigerbarn': ['svigersøn', 'svigerdatter'],
  'svoger_svigerinde': ['svoger', 'svigerinde'],
  'onkel_tante': ['onkel', 'tante', 'faster', 'moster', 'farbror', 'morbror'],
  'nevø_niece': ['nevø', 'niece'],
  'bedsteforældre': ['farfar', 'farmor', 'morfar', 'mormor'],
  'barnebarn': ['barnebarn'],
}
const GRUPPE_AF = new Map(Object.entries(GRUPPER).flatMap(([g, typer]) => typer.map(t => [t, g] as const)))

export const relationGruppe = (type: string) => GRUPPE_AF.get(type) ?? 'ukendt'

const FORÆLDRE = new Set(GRUPPER['forældre'])
const BØRN = new Set(GRUPPER['barn'])
const PARTNERE = new Set(GRUPPER['partner'])
const SØSKENDE = new Set(GRUPPER['søskende'])
const RENE_SØSKENDE = new Set(['bror', 'søster'])

const kønsvalg = (køn: string | null | undefined, mand: string, kvinde: string): string | null =>
  køn === 'mand' ? mand : køn === 'kvinde' ? kvinde : null

/**
 * A→type→B giver B→(invers)→A. Null, hvis B's køn mangler, hvor det kræves,
 * eller typen ikke har en entydig invers (barnebarn, enke, andet …).
 * `køn2` er køn på person 2 (B).
 */
export function inversRelation(type: string, køn2: string | null | undefined): string | null {
  switch (type) {
    case 'far': case 'mor': case 'adoptivfar': case 'adoptivmor': return kønsvalg(køn2, 'søn', 'datter')
    case 'plejefar': case 'plejemor': return kønsvalg(køn2, 'plejesøn', 'plejedatter')
    case 'stedfar': case 'stedmor': return kønsvalg(køn2, 'stedsøn', 'steddatter')
    case 'søn': case 'datter': return kønsvalg(køn2, 'far', 'mor')
    case 'plejesøn': case 'plejedatter': return kønsvalg(køn2, 'plejefar', 'plejemor')
    case 'stedsøn': case 'steddatter': return kønsvalg(køn2, 'stedfar', 'stedmor')
    case 'gift': case 'partner': case 'skilt': return type
    case 'bror': case 'søster': return kønsvalg(køn2, 'bror', 'søster')
    case 'halvbror': case 'halvsøster': return kønsvalg(køn2, 'halvbror', 'halvsøster')
    case 'stedbror': case 'stedsøster': return kønsvalg(køn2, 'stedbror', 'stedsøster')
    case 'plejebror': case 'plejesøster': return kønsvalg(køn2, 'plejebror', 'plejesøster')
    case 'svigerfar': case 'svigermor': return kønsvalg(køn2, 'svigersøn', 'svigerdatter')
    case 'svigersøn': case 'svigerdatter': return kønsvalg(køn2, 'svigerfar', 'svigermor')
    case 'svoger': case 'svigerinde': return kønsvalg(køn2, 'svoger', 'svigerinde')
    case 'onkel': case 'tante': case 'farbror': case 'morbror': case 'faster': case 'moster': return kønsvalg(køn2, 'nevø', 'niece')
    case 'nevø': case 'niece': return kønsvalg(køn2, 'onkel', 'tante')
    case 'farfar': case 'farmor': case 'morfar': case 'mormor': return 'barnebarn'
    default: return null
  }
}

export interface RelLike {
  id: string
  person1_id: string
  person1_navn: string
  person2_id: string
  person2_navn: string
  type_: string
}

/** Dublet = to relationer mellem samme (p1, p2) i samme gruppe. Inverser er ikke dubletter. */
export function findDubletter(relations: RelLike[]) {
  const seen = new Map<string, RelLike>()
  const out: { id1: string; type1: string; id2: string; type2: string; person1_navn: string; person2_navn: string; gruppe: string }[] = []
  for (const r of relations) {
    const gruppe = relationGruppe(r.type_)
    if (gruppe === 'ukendt') continue
    const key = `${r.person1_id}|${r.person2_id}|${gruppe}`
    const prev = seen.get(key)
    if (prev) {
      out.push({ id1: prev.id, type1: prev.type_, id2: r.id, type2: r.type_, person1_navn: r.person1_navn, person2_navn: r.person2_navn, gruppe })
    } else seen.set(key, r)
  }
  return out
}

export interface Forslag {
  person1_id: string
  person1_navn: string
  person2_id: string
  person2_navn: string
  type_: string
  begrundelse: string
}

/** Udleder relationer, der mangler, ud fra de eksisterende (svogre, bedsteforældre, søskende …). */
export function relationForslag(relations: RelLike[], køn: Map<string, string | null>): Forslag[] {
  const k = (id: string) => køn.get(id) ?? ''
  const navn = new Map<string, string>()
  for (const r of relations) {
    navn.set(r.person1_id, r.person1_navn)
    navn.set(r.person2_id, r.person2_navn)
  }
  const brugt = new Set(relations.map(r => `${r.person1_id}|${r.person2_id}|${relationGruppe(r.type_)}`))

  const find = (id: string, fra: Set<string>, til: Set<string>) => {
    const ids = new Set<string>()
    for (const r of relations) {
      if (r.person2_id === id && fra.has(r.type_)) ids.add(r.person1_id)
      else if (r.person1_id === id && til.has(r.type_)) ids.add(r.person2_id)
    }
    return [...ids]
  }
  const forældre = (id: string) => find(id, FORÆLDRE, BØRN)
  const børn = (id: string) => find(id, BØRN, FORÆLDRE)
  const symmetrisk = (id: string, typer: Set<string>) => find(id, typer, typer)

  const forslag: Forslag[] = []
  const add = (p1: string, p2: string, type: string, begrundelse: string) => {
    if (p1 === p2 || brugt.has(`${p1}|${p2}|${relationGruppe(type)}`)) return
    forslag.push({ person1_id: p1, person1_navn: navn.get(p1) ?? '', person2_id: p2, person2_navn: navn.get(p2) ?? '', type_: type, begrundelse })
  }
  const betegn = (køn: string, mand: string, kvinde: string, neutral: string) => kønsvalg(køn, mand, kvinde) ?? neutral
  const onkelTante = (forælderKøn: string, søskKøn: string) =>
    ({ 'mand|mand': 'farbror', 'mand|kvinde': 'faster', 'kvinde|mand': 'morbror', 'kvinde|kvinde': 'moster' } as Record<string, string>)[`${forælderKøn}|${søskKøn}`]
    ?? (søskKøn === 'kvinde' ? 'tante' : 'onkel')

  for (const id of navn.keys()) {
    const mineForældre = forældre(id)
    const mineBørn = børn(id)
    const minePartnere = symmetrisk(id, PARTNERE)
    const køn = k(id)

    // 1. Forældre til samme barn → partnere
    for (const barn of mineBørn)
      for (const anden of forældre(barn)) if (anden !== id) add(id, anden, 'partner', `Begge forældre til ${navn.get(barn)}`)

    // 2. Søskende via fælles forælder(e) – hel eller halv
    for (const f of mineForældre) {
      for (const søsk of børn(f)) {
        if (søsk === id) continue
        const delte = forældre(søsk).filter(x => mineForældre.includes(x)).length
        const type = delte >= 2 ? betegn(køn, 'bror', 'søster', 'søskende') : betegn(køn, 'halvbror', 'halvsøster', 'halvsøskende')
        add(id, søsk, type, delte >= 2 ? 'Fælles forældre' : `Fælles forælder: ${navn.get(f)}`)
      }
    }

    // 3. Bedsteforældre ↔ barnebarn
    for (const f of mineForældre) {
      for (const b of forældre(f)) {
        const type = ({ 'mand|mand': 'farfar', 'mand|kvinde': 'farmor', 'kvinde|mand': 'morfar', 'kvinde|kvinde': 'mormor' } as Record<string, string>)[`${k(f)}|${k(b)}`] ?? 'bedsteforælder'
        add(b, id, type, `Forælder til ${navn.get(f)}`)
        add(id, b, 'barnebarn', `Barnebarn af ${navn.get(b)}`)
      }
    }

    // 4. Partners søskende → svoger/svigerinde
    for (const partner of minePartnere) {
      for (const s of symmetrisk(partner, SØSKENDE)) {
        add(id, s, betegn(køn, 'svoger', 'svigerinde', 'svoger'), `${navn.get(partner)}s søskende`)
        add(s, id, betegn(k(s), 'svoger', 'svigerinde', 'svoger'), `${navn.get(partner)}s søskende`)
      }
    }

    // 5. Partners forældre → svigerforældre ↔ svigerbarn
    for (const partner of minePartnere) {
      for (const sf of forældre(partner)) {
        add(sf, id, betegn(k(sf), 'svigerfar', 'svigermor', 'svigerfar'), `${navn.get(partner)}s forælder`)
        add(id, sf, betegn(køn, 'svigersøn', 'svigerdatter', 'svigersøn'), `${navn.get(partner)}s forælder`)
      }
    }

    // 6. Rene søskendes børn → onkel/tante ↔ nevø/niece
    for (const s of symmetrisk(id, RENE_SØSKENDE)) {
      for (const barn of børn(s)) {
        add(id, barn, onkelTante(k(s), køn), `${navn.get(s)}s barn`)
        add(barn, id, betegn(k(barn), 'nevø', 'niece', 'nevø'), `${navn.get(s)}s barn`)
      }
    }

    // 7. Forælders rene søskende → onkel/tante ↔ nevø/niece
    for (const f of mineForældre) {
      for (const ot of symmetrisk(f, RENE_SØSKENDE)) {
        add(ot, id, onkelTante(k(f), k(ot)), `${navn.get(f)}s søskende`)
        add(id, ot, betegn(køn, 'nevø', 'niece', 'nevø'), `${navn.get(f)}s søskende`)
      }
    }

    // 8. Børns partnere → svigerforældre ↔ svigerbarn
    for (const barn of mineBørn) {
      for (const sv of symmetrisk(barn, PARTNERE)) {
        add(id, sv, betegn(køn, 'svigerfar', 'svigermor', 'svigerfar'), `${navn.get(barn)}s partner`)
        add(sv, id, betegn(k(sv), 'svigersøn', 'svigerdatter', 'svigersøn'), `${navn.get(barn)}s partner`)
      }
    }
  }

  const set = new Set<string>()
  return forslag.filter(f => {
    const key = `${f.person1_id}|${f.person2_id}|${relationGruppe(f.type_)}`
    if (set.has(key)) return false
    set.add(key)
    return true
  })
}
