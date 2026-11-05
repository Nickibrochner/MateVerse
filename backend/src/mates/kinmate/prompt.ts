import { db } from '../../db'
import { notFound } from '../../lib/http'

/** Samler alt om en person som tekst – til at kopiere ind i en AI-samtale eller gemme som .md. */
export function buildPrompt(id: string) {
  const p = db.query('SELECT * FROM kinmate_person WHERE id = ?').get(id) as {
    navn: string; fødselsdato: string | null; fødselsogn: string | null; dødsdato: string | null
    dødssogn: string | null; køn: string | null; noter: string | null
  } | null
  if (!p) throw notFound('Personen')

  const dato = (d: string | null) => (d ? ` (født ${d})` : ' (ukendt fødselsdato)')
  const erVar = (død: string | null) => (død ? 'var' : 'er')

  const ud = (db.query(
    `SELECT r.type, p2.navn, p2.fødselsdato FROM kinmate_relation r JOIN kinmate_person p2 ON p2.id = r.person2_id WHERE r.person1_id = ?`,
  ).all(id) as { type: string; navn: string; fødselsdato: string | null }[])
    .map(r => `- personen ${erVar(p.dødsdato)} ${r.type} til ${r.navn}${dato(r.fødselsdato)}`)
  const ind = (db.query(
    `SELECT r.type, p1.navn, p1.fødselsdato, p1.dødsdato FROM kinmate_relation r JOIN kinmate_person p1 ON p1.id = r.person1_id WHERE r.person2_id = ?`,
  ).all(id) as { type: string; navn: string; fødselsdato: string | null; dødsdato: string | null }[])
    .map(r => `- ${r.navn} ${erVar(r.dødsdato)} ${r.type} til personen${dato(r.fødselsdato)}`)

  const kilder = (db.query(
    `SELECT k.titel, kk.felt, kk.sikkerhed FROM kinmate_kilde_kobling kk JOIN kinmate_kilde k ON k.id = kk.kilde_id WHERE kk.person_id = ?`,
  ).all(id) as { titel: string; felt: string | null; sikkerhed: string | null }[])
    .map(k => `- ${k.titel}${k.felt ? ` (understøtter: ${k.felt})` : ''}${k.sikkerhed ? ` [${k.sikkerhed}]` : ''}`)

  const opgaver = (db.query(`SELECT beskrivelse FROM kinmate_forskningsopgave WHERE person_id = ? AND status != 'løst'`).all(id) as { beskrivelse: string }[])
    .map(o => `- ${o.beskrivelse}`)

  return `Her er alle tilgængelige data om en person fra min slægtsforsknings-app Kinmate.

STAMDATA:
Navn: ${p.navn}
Køn: ${p.køn ?? ''}
Født: ${p.fødselsdato ?? 'Ukendt'} i ${p.fødselsogn ?? 'Ukendt sogn'}
Død: ${p.dødsdato ?? 'Levende/Ukendt'} i ${p.dødssogn ?? 'Ukendt sogn'}
Noter: ${p.noter ?? ''}

RELATIONER:
${[...ud, ...ind].join('\n')}

KILDER ALLEREDE REGISTRERET:
${kilder.length ? kilder.join('\n') : 'Ingen kilder registreret endnu.'}

ÅBNE FORSKNINGSSPØRGSMÅL:
${opgaver.length ? opgaver.join('\n') : 'Ingen åbne spørgsmål registreret.'}

OPGAVE:
Find og verificér oplysninger om personens fødselsdato, dødsdato, fødested og familierelationer – brug gerne de åbne forskningsspørgsmål ovenfor som udgangspunkt. Hvis der mangler data, så hold dig til det vi ved, og angiv tydeligt hvad der er antaget/usikkert.`
}
