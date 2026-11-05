/**
 * GEDCOM 5.5.1 – et brugbart udsnit (stamdata og familierelationer), ikke fuld spec.
 * Rene funktioner; databasearbejdet ligger i routes.ts.
 */
import { inversRelation } from './relations'

const MÅNEDER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const FORÆLDRE = new Set(['far', 'mor', 'adoptivfar', 'adoptivmor', 'plejefar', 'plejemor', 'stedfar', 'stedmor'])
const BØRN = new Set(['søn', 'datter', 'plejesøn', 'plejedatter', 'stedsøn', 'steddatter'])
const PARTNERE = new Set(['gift', 'partner'])

export interface GPerson {
  id: string
  navn: string
  fødselsdato: string | null
  fødselsogn: string | null
  dødsdato: string | null
  dødssogn: string | null
  køn: string | null
}

/** "Anna Marie Hansen" → "Anna Marie /Hansen/" */
export const gedcomNavn = (navn: string) => {
  const i = navn.lastIndexOf(' ')
  return i < 0 ? navn : `${navn.slice(0, i).trim()} /${navn.slice(i).trim()}/`
}

/** 1890-03-05 → 5 MAR 1890; 1890-03 → MAR 1890; 1890 → 1890 */
export function gedcomDato(iso: string) {
  const [y, m, d] = iso.split('-')
  const mi = Number(m)
  if (m == null) return y
  if (!(mi >= 1 && mi <= 12)) return iso
  return d != null ? `${Number(d)} ${MÅNEDER[mi - 1]} ${y}` : `${MÅNEDER[mi - 1]} ${y}`
}

export function parseGedcomDato(raw: string): string {
  let s = raw.trim().replace(/^(ABT|EST|CAL|AFT|BEF|BET)\s+/, '')
  const and = s.indexOf(' AND ')
  if (and >= 0) s = s.slice(0, and)
  const dele = s.split(/\s+/)
  if (dele.length === 3) {
    const mi = MÅNEDER.indexOf(dele[1].toUpperCase())
    return mi >= 0 ? `${dele[2]}-${String(mi + 1).padStart(2, '0')}-${String(Number(dele[0]) || 1).padStart(2, '0')}` : raw
  }
  if (dele.length === 2) {
    const mi = MÅNEDER.indexOf(dele[0].toUpperCase())
    return mi >= 0 ? `${dele[1]}-${String(mi + 1).padStart(2, '0')}` : raw
  }
  return /^\d{4}$/.test(s) ? s : raw
}

export function exportGedcom(personer: GPerson[], relationer: { person1_id: string; person2_id: string; type: string }[]) {
  // Forældre pr. barn
  const forældreAf = new Map<string, Set<string>>()
  for (const r of relationer) {
    if (FORÆLDRE.has(r.type)) (forældreAf.get(r.person2_id) ?? forældreAf.set(r.person2_id, new Set()).get(r.person2_id)!).add(r.person1_id)
    else if (BØRN.has(r.type)) (forældreAf.get(r.person1_id) ?? forældreAf.set(r.person1_id, new Set()).get(r.person1_id)!).add(r.person2_id)
  }
  // Familier: sorteret forældresæt → børn. Barnløse par bliver også en familie.
  const familier = new Map<string, { forældre: string[]; børn: string[] }>()
  const fam = (forældre: string[]) => {
    const key = [...forældre].sort().join('|')
    return familier.get(key) ?? familier.set(key, { forældre: [...forældre].sort(), børn: [] }).get(key)!
  }
  for (const [barn, f] of forældreAf) if (f.size) fam([...f]).børn.push(barn)
  for (const r of relationer) if (PARTNERE.has(r.type)) fam([r.person1_id, r.person2_id])

  const køn = new Map(personer.map(p => [p.id, p.køn]))
  const xref = new Map(personer.map((p, i) => [p.id, `@I${i + 1}@`]))
  const famc = new Map<string, string[]>()
  const fams = new Map<string, string[]>()
  const push = (m: Map<string, string[]>, k: string, v: string) => (m.get(k) ?? m.set(k, []).get(k)!).push(v)

  const blokke: string[] = []
  let n = 0
  for (const f of familier.values()) {
    if (f.forældre.length < 2 && !f.børn.length) continue
    const fx = `@F${++n}@`
    let blok = `0 ${fx} FAM\n`
    for (const p of f.forældre) {
      if (!xref.has(p)) continue
      blok += `1 ${køn.get(p) === 'kvinde' ? 'WIFE' : 'HUSB'} ${xref.get(p)}\n`
      push(fams, p, fx)
    }
    for (const b of f.børn) {
      if (!xref.has(b)) continue
      blok += `1 CHIL ${xref.get(b)}\n`
      push(famc, b, fx)
    }
    blokke.push(blok)
  }

  let ud = '0 HEAD\n1 SOUR Kinmate\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n'
  for (const p of personer) {
    ud += `0 ${xref.get(p.id)} INDI\n1 NAME ${gedcomNavn(p.navn)}\n`
    if (p.køn) ud += `1 SEX ${p.køn === 'mand' ? 'M' : p.køn === 'kvinde' ? 'F' : 'U'}\n`
    if (p.fødselsdato || p.fødselsogn) {
      ud += '1 BIRT\n'
      if (p.fødselsdato) ud += `2 DATE ${gedcomDato(p.fødselsdato)}\n`
      if (p.fødselsogn) ud += `2 PLAC ${p.fødselsogn}\n`
    }
    if (p.dødsdato || p.dødssogn) {
      ud += '1 DEAT\n'
      if (p.dødsdato) ud += `2 DATE ${gedcomDato(p.dødsdato)}\n`
      if (p.dødssogn) ud += `2 PLAC ${p.dødssogn}\n`
    }
    for (const f of famc.get(p.id) ?? []) ud += `1 FAMC ${f}\n`
    for (const f of fams.get(p.id) ?? []) ud += `1 FAMS ${f}\n`
  }
  return ud + blokke.join('') + '0 TRLR\n'
}

export interface GedcomImport {
  personer: (Omit<GPerson, 'id'> & { xref: string })[]
  relationer: { p1: string; p2: string; type: string }[]
  advarsler: string[]
}

/** Tolker en GEDCOM-fil. Relationerne refererer til personernes xref (fx @I1@). */
export function parseGedcom(content: string): GedcomImport {
  const personer: GedcomImport['personer'] = []
  const familier: { husb?: string; wife?: string; chil: string[] }[] = []
  const advarsler: string[] = []
  let indi: GedcomImport['personer'][number] | null = null
  let fam: (typeof familier)[number] | null = null
  let kontekst = ''

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [niveauStr, anden = '', ...rest] = line.split(' ')
    const tredje = rest.join(' ')
    const niveau = Number(niveauStr)
    if (!Number.isInteger(niveau)) {
      advarsler.push(`Kunne ikke tolke linje: ${line}`)
      continue
    }
    if (niveau === 0) {
      if (indi) personer.push(indi)
      if (fam) familier.push(fam)
      indi = fam = null
      kontekst = ''
      if (tredje === 'INDI') indi = { xref: anden, navn: '', køn: null, fødselsdato: null, fødselsogn: null, dødsdato: null, dødssogn: null }
      else if (tredje === 'FAM') fam = { chil: [] }
      continue
    }
    if (niveau === 1) {
      kontekst = ''
      if (indi) {
        if (anden === 'NAME') indi.navn = tredje.replace(/\//g, '').replace(/\s+/g, ' ').trim()
        else if (anden === 'SEX') indi.køn = tredje === 'M' ? 'mand' : tredje === 'F' ? 'kvinde' : null
        else if (anden === 'BIRT' || anden === 'DEAT') kontekst = anden
      } else if (fam) {
        if (anden === 'HUSB') fam.husb = tredje
        else if (anden === 'WIFE') fam.wife = tredje
        else if (anden === 'CHIL') fam.chil.push(tredje)
      }
      continue
    }
    if (niveau === 2 && indi) {
      if (kontekst === 'BIRT' && anden === 'DATE') indi.fødselsdato = parseGedcomDato(tredje)
      else if (kontekst === 'BIRT' && anden === 'PLAC') indi.fødselsogn = tredje
      else if (kontekst === 'DEAT' && anden === 'DATE') indi.dødsdato = parseGedcomDato(tredje)
      else if (kontekst === 'DEAT' && anden === 'PLAC') indi.dødssogn = tredje
    }
  }
  if (indi) personer.push(indi)
  if (fam) familier.push(fam)

  const kendt = new Map(personer.map(p => [p.xref, p]))
  const relationer: GedcomImport['relationer'] = []
  for (const f of familier) {
    const husb = f.husb && kendt.has(f.husb) ? f.husb : undefined
    const wife = f.wife && kendt.has(f.wife) ? f.wife : undefined
    if (husb && wife) relationer.push({ p1: husb, p2: wife, type: 'gift' }, { p1: wife, p2: husb, type: 'gift' })
    for (const c of f.chil) {
      const barn = kendt.get(c)
      if (!barn) {
        advarsler.push(`Barn ${c} blev ikke fundet blandt de importerede personer`)
        continue
      }
      for (const [forælder, type] of [[husb, 'far'], [wife, 'mor']] as const) {
        if (!forælder) continue
        relationer.push({ p1: forælder, p2: c, type })
        const invers = inversRelation(type, barn.køn)
        if (invers) relationer.push({ p1: c, p2: forælder, type: invers })
      }
    }
  }
  for (const p of personer) if (!p.navn) p.navn = 'Ukendt navn'
  return { personer, relationer, advarsler }
}
