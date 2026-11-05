import { Elysia, t } from 'elysia'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { db, DB_PATH } from '../../db'
import { HttpError, httpErrors, notFound } from '../../lib/http'
import { findDubletter, inversRelation, relationForslag, type RelLike } from './relations'
import { exportGedcom, parseGedcom, type GPerson } from './gedcom'
import { buildPrompt } from './prompt'

/** Billeder ligger som filer ved siden af databasen. */
const BILLEDER = join(dirname(DB_PATH), 'kinmate-billeder')
mkdirSync(BILLEDER, { recursive: true })

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

interface Person extends GPerson {
  noter: string | null
  billede: string | null
}

const persons = () => db.query('SELECT * FROM kinmate_person ORDER BY navn COLLATE NOCASE').all() as Person[]
const relations = () => db.query(
  `SELECT r.id, r.person1_id, p1.navn AS person1_navn, r.person2_id, p2.navn AS person2_navn,
          r.type AS type_, r.start_dato, r.slut_dato, r.noter
   FROM kinmate_relation r
   JOIN kinmate_person p1 ON p1.id = r.person1_id
   JOIN kinmate_person p2 ON p2.id = r.person2_id
   ORDER BY r.created_at, r.rowid`,
).all() as (RelLike & { start_dato: string | null; slut_dato: string | null; noter: string | null })[]

function getPerson(id: string) {
  const p = db.query('SELECT * FROM kinmate_person WHERE id = ?').get(id) as Person | null
  if (!p) throw notFound('Personen')
  return p
}

function sletBillede(fil: string | null) {
  if (fil) rmSync(join(BILLEDER, fil), { force: true })
}

const opt = t.Optional(t.Nullable(t.String()))
const personBody = t.Object({
  navn: t.String({ minLength: 1 }),
  fødselsdato: opt, fødselsogn: opt, dødsdato: opt, dødssogn: opt, køn: opt, noter: opt,
})
const relationBody = t.Object({
  person1_id: t.String(), person2_id: t.String(), type_: t.String({ minLength: 1 }),
  start_dato: opt, slut_dato: opt, noter: opt,
})
const kildeBody = t.Object({ titel: t.String({ minLength: 1 }), type_: opt, arkiv_reference: opt, url: opt, noter: opt })
const idParam = { params: t.Object({ id: t.String() }) }
const tom = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

function personValues(b: typeof personBody.static) {
  return [b.navn.trim(), tom(b.fødselsdato), tom(b.fødselsogn), tom(b.dødsdato), tom(b.dødssogn), tom(b.køn), tom(b.noter)]
}

/** Opretter en relation og – hvis den kan udledes – modparten. Bruges også af GEDCOM-import. */
function createRelation(b: typeof relationBody.static) {
  if (b.person1_id === b.person2_id) throw new HttpError(422, 'En person kan ikke have en relation til sig selv.')
  getPerson(b.person1_id)
  const p2 = getPerson(b.person2_id)
  return db.transaction(() => {
    if (db.query('SELECT 1 FROM kinmate_relation WHERE person1_id = ? AND person2_id = ? AND type = ?').get(b.person1_id, b.person2_id, b.type_))
      throw new HttpError(409, `Der findes allerede en '${b.type_}' mellem de to personer.`)
    const { id } = db.query(
      'INSERT INTO kinmate_relation (person1_id, person2_id, type, start_dato, slut_dato, noter) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    ).get(b.person1_id, b.person2_id, b.type_, tom(b.start_dato), tom(b.slut_dato), tom(b.noter)) as { id: string }
    const invers = inversRelation(b.type_, p2.køn)
    if (invers && !db.query('SELECT 1 FROM kinmate_relation WHERE person1_id = ? AND person2_id = ? AND type = ?').get(b.person2_id, b.person1_id, invers)) {
      db.query('INSERT INTO kinmate_relation (person1_id, person2_id, type, start_dato, slut_dato, noter) VALUES (?, ?, ?, ?, ?, ?)')
        .run(b.person2_id, b.person1_id, invers, tom(b.start_dato), tom(b.slut_dato), 'Auto-oprettet modpart')
    }
    return { id }
  })()
}

/** Flytter alt fra remove til keep, udfylder tomme felter og undgår dubletrelationer. */
function mergePersons(keep: string, remove: string) {
  if (keep === remove) throw new HttpError(422, 'Kan ikke flette en person med sig selv.')
  getPerson(keep)
  const gammel = getPerson(remove)
  db.transaction(() => {
    db.query(
      `UPDATE kinmate_person SET
         fødselsdato = COALESCE(NULLIF(fødselsdato, ''), (SELECT fødselsdato FROM kinmate_person WHERE id = ?2)),
         fødselsogn  = COALESCE(NULLIF(fødselsogn,  ''), (SELECT fødselsogn  FROM kinmate_person WHERE id = ?2)),
         dødsdato    = COALESCE(NULLIF(dødsdato,    ''), (SELECT dødsdato    FROM kinmate_person WHERE id = ?2)),
         dødssogn    = COALESCE(NULLIF(dødssogn,    ''), (SELECT dødssogn    FROM kinmate_person WHERE id = ?2)),
         køn         = COALESCE(NULLIF(køn,         ''), (SELECT køn         FROM kinmate_person WHERE id = ?2)),
         noter       = COALESCE(NULLIF(noter,       ''), (SELECT noter       FROM kinmate_person WHERE id = ?2)),
         billede     = COALESCE(billede, (SELECT billede FROM kinmate_person WHERE id = ?2))
       WHERE id = ?1`,
    ).run(keep, remove)
    const rels = db.query('SELECT id, person1_id, person2_id, type FROM kinmate_relation WHERE person1_id = ?1 OR person2_id = ?1').all(remove) as
      { id: string; person1_id: string; person2_id: string; type: string }[]
    for (const r of rels) {
      const p1 = r.person1_id === remove ? keep : r.person1_id
      const p2 = r.person2_id === remove ? keep : r.person2_id
      const dublet = p1 === p2 || db.query('SELECT 1 FROM kinmate_relation WHERE person1_id = ? AND person2_id = ? AND type = ? AND id != ?').get(p1, p2, r.type, r.id)
      if (dublet) db.query('DELETE FROM kinmate_relation WHERE id = ?').run(r.id)
      else db.query('UPDATE kinmate_relation SET person1_id = ?, person2_id = ? WHERE id = ?').run(p1, p2, r.id)
    }
    db.query('UPDATE kinmate_kilde_kobling SET person_id = ? WHERE person_id = ?').run(keep, remove)
    db.query('UPDATE kinmate_forskningsopgave SET person_id = ? WHERE person_id = ?').run(keep, remove)
    db.query('DELETE FROM kinmate_person WHERE id = ?').run(remove)
  })()
  // Billedet slettes kun, hvis keep ikke har arvet det
  if (gammel.billede && getPerson(keep).billede !== gammel.billede) sletBillede(gammel.billede)
}

// ── Backup (samme JSON-format som Tauri-udgaven, så data kan flyttes direkte) ──
function backup() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    persons: db.query('SELECT id, navn, fødselsdato, fødselsogn, dødsdato, dødssogn, køn, noter, billede AS billede_sti FROM kinmate_person').all(),
    relations: db.query('SELECT id, person1_id, person2_id, type AS type_, start_dato, slut_dato, noter FROM kinmate_relation').all(),
    kilder: db.query('SELECT id, titel, type AS type_, arkiv_reference, url, noter FROM kinmate_kilde').all(),
    kilde_koblinger: db.query('SELECT id, kilde_id, person_id, relation_id, felt, sikkerhed, noter FROM kinmate_kilde_kobling').all(),
    forskningsopgaver: db.query('SELECT id, person_id, beskrivelse, status FROM kinmate_forskningsopgave').all(),
    steder: db.query('SELECT id, navn, lat, lng, kilde FROM kinmate_sted').all(),
  }
}

const anyRows = t.Array(t.Record(t.String(), t.Any()))
const backupBody = t.Object({
  persons: anyRows, relations: anyRows, kilder: anyRows, kilde_koblinger: anyRows, forskningsopgaver: anyRows,
  steder: t.Optional(anyRows),
}, { additionalProperties: true })

function restore(b: typeof backupBody.static) {
  db.transaction(() => {
    for (const table of ['kilde_kobling', 'forskningsopgave', 'kilde', 'relation', 'person', 'sted']) db.query(`DELETE FROM kinmate_${table}`).run()
    // Billeder beholdes kun, hvis filen findes her. Stier fra Tauri-udgaven peger på den gamle maskine.
    for (const p of b.persons) {
      const fil = typeof p.billede_sti === 'string' ? basename(p.billede_sti) : null
      db.query('INSERT INTO kinmate_person (id, navn, fødselsdato, fødselsogn, dødsdato, dødssogn, køn, noter, billede) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.id, p.navn, p.fødselsdato ?? null, p.fødselsogn ?? null, p.dødsdato ?? null, p.dødssogn ?? null, p.køn ?? null, p.noter ?? null,
          fil && existsSync(join(BILLEDER, fil)) ? fil : null)
    }
    for (const r of b.relations)
      db.query('INSERT INTO kinmate_relation (id, person1_id, person2_id, type, start_dato, slut_dato, noter) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, r.person1_id, r.person2_id, r.type_ ?? r.type, r.start_dato ?? null, r.slut_dato ?? null, r.noter ?? null)
    for (const k of b.kilder)
      db.query('INSERT INTO kinmate_kilde (id, titel, type, arkiv_reference, url, noter) VALUES (?, ?, ?, ?, ?, ?)')
        .run(k.id, k.titel, k.type_ ?? k.type ?? null, k.arkiv_reference ?? null, k.url ?? null, k.noter ?? null)
    for (const k of b.kilde_koblinger)
      db.query('INSERT INTO kinmate_kilde_kobling (id, kilde_id, person_id, relation_id, felt, sikkerhed, noter) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(k.id, k.kilde_id, k.person_id ?? null, k.relation_id ?? null, k.felt ?? null, k.sikkerhed ?? null, k.noter ?? null)
    for (const o of b.forskningsopgaver)
      db.query('INSERT INTO kinmate_forskningsopgave (id, person_id, beskrivelse, status) VALUES (?, ?, ?, ?)')
        .run(o.id, o.person_id, o.beskrivelse, o.status ?? 'åben')
    for (const s of b.steder ?? [])
      db.query('INSERT INTO kinmate_sted (id, navn, lat, lng, kilde) VALUES (?, ?, ?, ?, ?)').run(s.id, s.navn, s.lat ?? null, s.lng ?? null, s.kilde ?? null)
  })()
}

export const kinmate = new Elysia({ prefix: '/kinmate' })
  .use(httpErrors)

  /** Alt på én gang – frontenden holder det i en store, ligesom Tauri-udgaven. */
  .get('/data', () => ({
    persons: persons(),
    relations: relations(),
    kilder: db.query('SELECT id, titel, type AS type_, arkiv_reference, url, noter, oprettet_at FROM kinmate_kilde ORDER BY titel COLLATE NOCASE').all(),
    kilde_koblinger: db.query(
      `SELECT kk.id, kk.kilde_id, k.titel AS kilde_titel, kk.person_id, kk.relation_id, kk.felt, kk.sikkerhed, kk.noter
       FROM kinmate_kilde_kobling kk JOIN kinmate_kilde k ON k.id = kk.kilde_id ORDER BY kk.oprettet_at`,
    ).all(),
    forskningsopgaver: db.query('SELECT * FROM kinmate_forskningsopgave ORDER BY oprettet_at DESC').all(),
    steder: db.query('SELECT * FROM kinmate_sted ORDER BY navn').all(),
  }))

  // ── Personer ──
  .post('/persons', ({ body }) =>
    db.query('INSERT INTO kinmate_person (navn, fødselsdato, fødselsogn, dødsdato, dødssogn, køn, noter) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .get(...personValues(body)) as Person, { body: personBody })
  .put('/persons/:id', ({ params, body }) => {
    getPerson(params.id)
    return db.query('UPDATE kinmate_person SET navn = ?, fødselsdato = ?, fødselsogn = ?, dødsdato = ?, dødssogn = ?, køn = ?, noter = ? WHERE id = ? RETURNING *')
      .get(...personValues(body), params.id) as Person
  }, { ...idParam, body: personBody })
  .delete('/persons/:id', ({ params }) => {
    const p = getPerson(params.id)
    db.query('DELETE FROM kinmate_person WHERE id = ?').run(params.id) // relationer m.m. følger med (ON DELETE CASCADE)
    sletBillede(p.billede)
    return { deleted: params.id }
  }, idParam)
  .get('/persons/:id/billede', ({ params, set }) => {
    const p = getPerson(params.id)
    if (!p.billede || !existsSync(join(BILLEDER, p.billede))) throw notFound('Billedet')
    set.headers['cache-control'] = 'public, max-age=31536000, immutable'
    return Bun.file(join(BILLEDER, p.billede))
  }, idParam)
  /** Billedet sendes som data-URL; null fjerner det. */
  .put('/persons/:id/billede', async ({ params, body }) => {
    const p = getPerson(params.id)
    if (body.image == null) {
      db.query('UPDATE kinmate_person SET billede = NULL WHERE id = ?').run(params.id)
      sletBillede(p.billede)
      return getPerson(params.id)
    }
    const m = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/.exec(body.image)
    if (!m) throw new HttpError(400, 'Ugyldigt billede')
    const bytes = Buffer.from(m[2], 'base64')
    if (bytes.length > 8 * 1024 * 1024) throw new HttpError(413, 'Billedet er for stort (max 8 MB)')
    // Tidsstempel i filnavnet, så browseren ikke viser et gammelt billede fra cachen
    const fil = `${params.id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    await Bun.write(join(BILLEDER, fil), bytes)
    db.query('UPDATE kinmate_person SET billede = ? WHERE id = ?').run(fil, params.id)
    sletBillede(p.billede)
    return getPerson(params.id)
  }, { ...idParam, body: t.Object({ image: t.Nullable(t.String()) }) })
  .get('/persons/:id/prompt', ({ params }) => ({ prompt: buildPrompt(params.id) }), idParam)
  .post('/persons/merge', ({ body }) => {
    mergePersons(body.keep_id, body.remove_id)
    return { merged: body.remove_id }
  }, { body: t.Object({ keep_id: t.String(), remove_id: t.String() }) })

  // ── Relationer ──
  .post('/relations', ({ body }) => createRelation(body), { body: relationBody })
  .put('/relations/:id', ({ params, body }) => {
    if (body.person1_id === body.person2_id) throw new HttpError(422, 'En person kan ikke have en relation til sig selv.')
    const res = db.query('UPDATE kinmate_relation SET person1_id = ?, person2_id = ?, type = ?, start_dato = ?, slut_dato = ?, noter = ? WHERE id = ?')
      .run(body.person1_id, body.person2_id, body.type_, tom(body.start_dato), tom(body.slut_dato), tom(body.noter), params.id)
    if (!res.changes) throw notFound('Relationen')
    return { id: params.id }
  }, { ...idParam, body: relationBody })
  .delete('/relations/:id', ({ params }) => {
    if (!db.query('DELETE FROM kinmate_relation WHERE id = ?').run(params.id).changes) throw notFound('Relationen')
    return { deleted: params.id }
  }, idParam)
  .get('/dubletter', () => findDubletter(relations()))
  .get('/forslag', () => {
    const køn = new Map((db.query('SELECT id, køn FROM kinmate_person').all() as { id: string; køn: string | null }[]).map(p => [p.id, p.køn]))
    return relationForslag(relations(), køn)
  })

  // ── Kilder, koblinger og forskningsopgaver ──
  .post('/kilder', ({ body }) =>
    db.query('INSERT INTO kinmate_kilde (titel, type, arkiv_reference, url, noter) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .get(body.titel.trim(), tom(body.type_), tom(body.arkiv_reference), tom(body.url), tom(body.noter)), { body: kildeBody })
  .put('/kilder/:id', ({ params, body }) => {
    if (!db.query('UPDATE kinmate_kilde SET titel = ?, type = ?, arkiv_reference = ?, url = ?, noter = ? WHERE id = ?')
      .run(body.titel.trim(), tom(body.type_), tom(body.arkiv_reference), tom(body.url), tom(body.noter), params.id).changes) throw notFound('Kilden')
    return { id: params.id }
  }, { ...idParam, body: kildeBody })
  .delete('/kilder/:id', ({ params }) => {
    if (!db.query('DELETE FROM kinmate_kilde WHERE id = ?').run(params.id).changes) throw notFound('Kilden')
    return { deleted: params.id }
  }, idParam)
  .post('/koblinger', ({ body }) => {
    if (!body.person_id && !body.relation_id) throw new HttpError(400, 'Kilden skal kobles til en person eller en relation')
    return db.query('INSERT INTO kinmate_kilde_kobling (kilde_id, person_id, relation_id, felt, sikkerhed, noter) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .get(body.kilde_id, body.person_id ?? null, body.relation_id ?? null, tom(body.felt), tom(body.sikkerhed), tom(body.noter))
  }, { body: t.Object({ kilde_id: t.String(), person_id: opt, relation_id: opt, felt: opt, sikkerhed: opt, noter: opt }) })
  .delete('/koblinger/:id', ({ params }) => {
    db.query('DELETE FROM kinmate_kilde_kobling WHERE id = ?').run(params.id)
    return { deleted: params.id }
  }, idParam)
  .post('/opgaver', ({ body }) => {
    getPerson(body.person_id)
    return db.query('INSERT INTO kinmate_forskningsopgave (person_id, beskrivelse) VALUES (?, ?) RETURNING id').get(body.person_id, body.beskrivelse.trim())
  }, { body: t.Object({ person_id: t.String(), beskrivelse: t.String({ minLength: 1 }) }) })
  .put('/opgaver/:id/status', ({ params, body }) => {
    db.query(`UPDATE kinmate_forskningsopgave SET status = ?, løst_at = CASE WHEN ? = 'løst' THEN datetime('now') ELSE NULL END WHERE id = ?`)
      .run(body.status, body.status, params.id)
    return { id: params.id }
  }, { ...idParam, body: t.Object({ status: t.String() }) })
  .delete('/opgaver/:id', ({ params }) => {
    db.query('DELETE FROM kinmate_forskningsopgave WHERE id = ?').run(params.id)
    return { deleted: params.id }
  }, idParam)

  // ── Steder (kort) ──
  .put('/steder', ({ body }) => db.query(
    `INSERT INTO kinmate_sted (navn, lat, lng, kilde) VALUES (?, ?, ?, 'manuel')
     ON CONFLICT(navn) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, kilde = 'manuel' RETURNING *`,
  ).get(body.navn, body.lat, body.lng), { body: t.Object({ navn: t.String(), lat: t.Number(), lng: t.Number() }) })
  /**
   * Slår et stednavn op hos Nominatim (OpenStreetMap) og gemmer resultatet permanent.
   * Frontenden kalder ét sted ad gangen for at overholde Nominatims vilkår (~1 opslag/sek.).
   */
  .post('/steder/geocode', async ({ body }) => {
    const hit = db.query('SELECT * FROM kinmate_sted WHERE navn = ?').get(body.navn)
    if (hit) return hit
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${body.navn}, Danmark`)}&format=json&limit=1&countrycodes=dk`
    let json: { lat: string; lon: string }[]
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MateVerse-Kinmate/1.0 (slaegtsforskning, privat brug)' }, signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      json = await res.json() as typeof json
    } catch (e) {
      throw new HttpError(502, `Kunne ikke slå '${body.navn}' op hos Nominatim: ${(e as Error).message}`)
    }
    if (!json[0]) throw new HttpError(404, `Ingen resultater hos Nominatim for '${body.navn}'`)
    return db.query(
      `INSERT INTO kinmate_sted (navn, lat, lng, kilde) VALUES (?, ?, ?, 'nominatim')
       ON CONFLICT(navn) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, kilde = 'nominatim' RETURNING *`,
    ).get(body.navn, Number(json[0].lat), Number(json[0].lon))
  }, { body: t.Object({ navn: t.String({ minLength: 1 }) }) })

  // ── GEDCOM og backup ──
  .get('/gedcom', ({ set }) => {
    set.headers['content-type'] = 'text/plain; charset=utf-8'
    set.headers['content-disposition'] = `attachment; filename="kinmate-${new Date().toISOString().slice(0, 10)}.ged"`
    return exportGedcom(persons(), db.query('SELECT person1_id, person2_id, type FROM kinmate_relation').all() as { person1_id: string; person2_id: string; type: string }[])
  })
  .post('/gedcom', ({ body }) => {
    const imp = parseGedcom(body.content)
    if (!imp.personer.length) throw new HttpError(422, 'Ingen personer (INDI) fundet i filen – er det en gyldig GEDCOM-fil?')
    return db.transaction(() => {
      const ids = new Map<string, string>()
      for (const p of imp.personer) {
        const { id } = db.query('INSERT INTO kinmate_person (navn, fødselsdato, fødselsogn, dødsdato, dødssogn, køn) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
          .get(p.navn, p.fødselsdato, p.fødselsogn, p.dødsdato, p.dødssogn, p.køn) as { id: string }
        ids.set(p.xref, id)
      }
      for (const r of imp.relationer)
        db.query('INSERT INTO kinmate_relation (person1_id, person2_id, type) VALUES (?, ?, ?)').run(ids.get(r.p1)!, ids.get(r.p2)!, r.type)
      return { personer: imp.personer.length, relationer: imp.relationer.length, advarsler: imp.advarsler }
    })()
  }, { body: t.Object({ content: t.String() }) })
  .get('/backup', () => backup())
  .post('/backup', ({ body }) => {
    restore(body)
    return { personer: body.persons.length, relationer: body.relations.length }
  }, { body: backupBody })
