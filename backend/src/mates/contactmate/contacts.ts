import { db } from '../../db'

/**
 * ContactMate kerne: kontakter, emails, telefoner, grupper, dublet-scanning/merge og eksport.
 * Port af Tauri-udgavens `kontakt`-tabeller — feltnavnene er bevidst de samme (danske) som i
 * den oprindelige app, så frontend-portet kunne genbruge samme datamodel.
 */

export interface Contact {
  id: string
  google_id: string | null
  fornavn: string | null
  efternavn: string | null
  visningsnavn: string
  firma: string | null
  titel: string | null
  foto_url: string | null
  noter: string | null
  synced_at: string | null
  lokalt_redigeret: number
  ny_fra_google: number
  foedselsdag: string | null
  foedselsdag_uden_aar: number
  adresse_gade: string | null
  adresse_by: string | null
  adresse_postnr: string | null
  adresse_land: string | null
  sidst_kontakt_at: string | null
  antal_emails: number
  sidst_gmail_sync: string | null
}

export interface ContactEmail {
  id: string
  contact_id: string
  email: string
  type: string | null
  primaer: number
  klassificering: string | null
  lokalt_redigeret: number
  ny_fra_google: number
}

export interface ContactPhone {
  id: string
  contact_id: string
  nummer: string
  type: string | null
  primaer: number
  lokalt_redigeret: number
  ny_fra_google: number
}

export interface ContactDetail {
  contact: Contact
  emails: ContactEmail[]
  phones: ContactPhone[]
  groups: string[]
}

export interface Group {
  google_id: string
  navn: string
}

export interface UpdateContactInput {
  fornavn: string | null
  efternavn: string | null
  firma: string | null
  titel: string | null
  noter: string | null
  foedselsdag: string | null
  foedselsdag_uden_aar: boolean
  adresse_gade: string | null
  adresse_by: string | null
  adresse_postnr: string | null
  adresse_land: string | null
}

export interface UpdateEmailInput {
  id: string
  type: string | null
  primaer: boolean
  klassificering: string | null
}

export interface MergeInput {
  keep_id: string
  delete_id: string
  fornavn: string | null
  efternavn: string | null
  firma: string | null
  titel: string | null
  noter: string | null
}

// ── Auto-klassificering af email (privat/arbejde) ──────────────────────────────

const PRIVATE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.dk', 'hotmail.se', 'hotmail.no',
  'outlook.com', 'outlook.dk',
  'live.com', 'live.dk',
  'yahoo.com', 'yahoo.dk', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com',
  'tutanota.com',
  'mail.dk', 'jubii.dk',
  'msn.com',
])

export function autoClassify(email: string): 'auto_privat' | 'auto_arbejde' {
  const domain = email.split('@').pop()?.toLowerCase() ?? ''
  return PRIVATE_DOMAINS.has(domain) ? 'auto_privat' : 'auto_arbejde'
}

// ── Navne-matching (brugt af dublet-scan og LinkedIn-import) ───────────────────

/** Normaliserer en streng til sammenligning: lowercase, trim, fjern punktum. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\./g, '').split(/\s+/).filter(Boolean).join(' ')
}

/** Navne-lighed baseret på delte tokens (ord). "Mads Christian Jensen" vs "Mads Jensen" → 2/3 → 66. */
export function nameSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.split(/\s+/).filter(Boolean))
  const shared = [...tokensA].filter(t => tokensB.has(t)).length
  const max = Math.max(tokensA.size, tokensB.size)
  return max === 0 ? 0 : Math.round((shared * 100) / max)
}

// ── Kontakter ───────────────────────────────────────────────────────────────────

export function listContacts(search?: string, groupId?: string): Contact[] {
  if (groupId) {
    if (search) {
      const q = `%${search.toLowerCase()}%`
      return db.query(
        `SELECT DISTINCT k.* FROM contactmate_contact k
         JOIN contactmate_contact_group kg ON kg.contact_id = k.id AND kg.group_id = ?
         LEFT JOIN contactmate_email e ON e.contact_id = k.id
         LEFT JOIN contactmate_phone t ON t.contact_id = k.id
         WHERE lower(k.visningsnavn) LIKE ? OR lower(k.firma) LIKE ? OR lower(e.email) LIKE ? OR lower(t.nummer) LIKE ?
         ORDER BY k.visningsnavn ASC`,
      ).all(groupId, q, q, q, q) as Contact[]
    }
    return db.query(
      `SELECT k.* FROM contactmate_contact k
       JOIN contactmate_contact_group kg ON kg.contact_id = k.id AND kg.group_id = ?
       ORDER BY k.visningsnavn ASC`,
    ).all(groupId) as Contact[]
  }
  if (search) {
    const q = `%${search.toLowerCase()}%`
    return db.query(
      `SELECT DISTINCT k.* FROM contactmate_contact k
       LEFT JOIN contactmate_email e ON e.contact_id = k.id
       LEFT JOIN contactmate_phone t ON t.contact_id = k.id
       WHERE lower(k.visningsnavn) LIKE ? OR lower(k.firma) LIKE ? OR lower(e.email) LIKE ? OR lower(t.nummer) LIKE ?
       ORDER BY k.visningsnavn ASC`,
    ).all(q, q, q, q) as Contact[]
  }
  return db.query('SELECT * FROM contactmate_contact ORDER BY visningsnavn ASC').all() as Contact[]
}

function groupsFor(contactId: string): string[] {
  return (
    db.query(
      `SELECT g.navn FROM contactmate_group g
       JOIN contactmate_contact_group cg ON cg.group_id = g.google_id
       WHERE cg.contact_id = ? ORDER BY g.navn ASC`,
    ).all(contactId) as { navn: string }[]
  ).map(r => r.navn)
}

export function getContactDetail(id: string): ContactDetail | null {
  const contact = db.query('SELECT * FROM contactmate_contact WHERE id = ?').get(id) as Contact | null
  if (!contact) return null
  const emails = db.query('SELECT * FROM contactmate_email WHERE contact_id = ? ORDER BY primaer DESC').all(id) as ContactEmail[]
  const phones = db.query('SELECT * FROM contactmate_phone WHERE contact_id = ? ORDER BY primaer DESC').all(id) as ContactPhone[]
  return { contact, emails, phones, groups: groupsFor(id) }
}

export function updateContact(id: string, input: UpdateContactInput) {
  const current = db.query('SELECT visningsnavn FROM contactmate_contact WHERE id = ?').get(id) as { visningsnavn: string } | null
  if (!current) return
  const trimmed = `${input.fornavn ?? ''} ${input.efternavn ?? ''}`.trim()
  const visningsnavn = trimmed || current.visningsnavn
  db.query(
    `UPDATE contactmate_contact SET
       fornavn = ?, efternavn = ?, firma = ?, titel = ?, noter = ?,
       foedselsdag = ?, foedselsdag_uden_aar = ?,
       adresse_gade = ?, adresse_by = ?, adresse_postnr = ?, adresse_land = ?,
       lokalt_redigeret = 1, ny_fra_google = 0, visningsnavn = ?
     WHERE id = ?`,
  ).run(
    input.fornavn, input.efternavn, input.firma, input.titel, input.noter,
    input.foedselsdag, input.foedselsdag_uden_aar ? 1 : 0,
    input.adresse_gade, input.adresse_by, input.adresse_postnr, input.adresse_land,
    visningsnavn, id,
  )
}

export function updateEmail(input: UpdateEmailInput) {
  if (input.primaer) {
    const row = db.query('SELECT contact_id FROM contactmate_email WHERE id = ?').get(input.id) as { contact_id: string } | null
    if (row) db.query('UPDATE contactmate_email SET primaer = 0 WHERE contact_id = ?').run(row.contact_id)
  }
  db.query(
    'UPDATE contactmate_email SET type = ?, primaer = ?, klassificering = ?, lokalt_redigeret = 1, ny_fra_google = 0 WHERE id = ?',
  ).run(input.type, input.primaer ? 1 : 0, input.klassificering, input.id)
}

export function updatePhone(id: string, type: string | null, primaer: boolean) {
  if (primaer) {
    const row = db.query('SELECT contact_id FROM contactmate_phone WHERE id = ?').get(id) as { contact_id: string } | null
    if (row) db.query('UPDATE contactmate_phone SET primaer = 0 WHERE contact_id = ?').run(row.contact_id)
  }
  db.query('UPDATE contactmate_phone SET type = ?, primaer = ? WHERE id = ?').run(type, primaer ? 1 : 0, id)
}

export function deleteEmail(id: string) {
  db.query('DELETE FROM contactmate_email WHERE id = ?').run(id)
}

export function deletePhone(id: string) {
  db.query('DELETE FROM contactmate_phone WHERE id = ?').run(id)
}

export function acceptGoogleData(id: string) {
  db.query('UPDATE contactmate_contact SET lokalt_redigeret = 0, ny_fra_google = 0 WHERE id = ?').run(id)
  db.query('UPDATE contactmate_email SET lokalt_redigeret = 0, ny_fra_google = 0 WHERE contact_id = ?').run(id)
  db.query('UPDATE contactmate_phone SET lokalt_redigeret = 0, ny_fra_google = 0 WHERE contact_id = ?').run(id)
}

/** Sletter kontakten lokalt og returnerer dens google_id (hvis nogen), så kaldstedet kan slette hos Google også. */
export function deleteContactLocal(id: string): string | null {
  const row = db.query('SELECT google_id FROM contactmate_contact WHERE id = ?').get(id) as { google_id: string | null } | null
  const googleId = row?.google_id ?? null
  if (googleId) db.query('INSERT OR IGNORE INTO contactmate_deleted_google_id (google_id) VALUES (?)').run(googleId)
  db.query('DELETE FROM contactmate_contact WHERE id = ?').run(id)
  return googleId
}

export function listGroups(): Group[] {
  return db.query('SELECT google_id, navn FROM contactmate_group ORDER BY navn ASC').all() as Group[]
}

// ── Dublet-scanning ──────────────────────────────────────────────────────────────

export interface DuplicatePair {
  a: ContactDetail
  b: ContactDetail
  score: number
  reason: string
}

export interface InternalDuplicate {
  contact_id: string
  visningsnavn: string
  type: 'email' | 'telefon'
  vaerdi: string
  ids: string[]
}

export interface DuplicateResult {
  pairs: DuplicatePair[]
  internal: InternalDuplicate[]
}

const digitsOnly = (s: string) => s.replace(/\D/g, '')

export function findDuplicates(): DuplicateResult {
  const all = db.query('SELECT id, visningsnavn, fornavn, efternavn FROM contactmate_contact ORDER BY visningsnavn').all() as {
    id: string; visningsnavn: string; fornavn: string | null; efternavn: string | null
  }[]

  const emailMap = new Map<string, string[]>()
  for (const r of db.query('SELECT contact_id, lower(email) AS email FROM contactmate_email').all() as { contact_id: string; email: string }[]) {
    emailMap.set(r.contact_id, [...(emailMap.get(r.contact_id) ?? []), r.email])
  }
  const phoneMap = new Map<string, string[]>()
  for (const r of db.query('SELECT contact_id, nummer FROM contactmate_phone').all() as { contact_id: string; nummer: string }[]) {
    phoneMap.set(r.contact_id, [...(phoneMap.get(r.contact_id) ?? []), r.nummer])
  }
  const ignored = new Set(
    (db.query('SELECT id_a, id_b FROM contactmate_ignored_duplicate').all() as { id_a: string; id_b: string }[]).map(
      r => `${r.id_a}|${r.id_b}`,
    ),
  )

  const pairs: DuplicatePair[] = []
  const seen = new Set<string>()

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      const normA = normalize(a.visningsnavn)
      const normB = normalize(b.visningsnavn)

      let score = 0
      const reasons: string[] = []

      if (normA === normB) {
        score = Math.max(score, 95)
        reasons.push('Identisk navn')
      } else {
        const nameScore = nameSimilarity(normA, normB)
        if (nameScore >= 80) {
          score = Math.max(score, nameScore)
          reasons.push(`Navn ligner ${nameScore}%`)
        }
        if (
          a.fornavn && b.fornavn && normalize(a.fornavn) === normalize(b.fornavn) &&
          a.efternavn && b.efternavn && normalize(a.efternavn) === normalize(b.efternavn)
        ) {
          score = Math.max(score, 85)
          reasons.push('Samme for- og efternavn')
        }
      }

      const emailsA = emailMap.get(a.id) ?? []
      const emailsB = emailMap.get(b.id) ?? []
      const sharedEmail = emailsA.find(e => emailsB.includes(e))
      if (sharedEmail) {
        score = Math.max(score, 90)
        reasons.push(`Samme email: ${sharedEmail}`)
      }

      const phonesA = (phoneMap.get(a.id) ?? []).map(digitsOnly)
      const phonesB = (phoneMap.get(b.id) ?? []).map(digitsOnly)
      const sharedPhone = phonesA.find(p => phonesB.includes(p))
      if (sharedPhone) {
        score = Math.max(score, 90)
        reasons.push(`Samme telefon: ${sharedPhone}`)
      }

      if (score < 70) continue
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (ignored.has(key) || seen.has(key)) continue
      seen.add(key)

      const detailA = getContactDetail(a.id)
      const detailB = getContactDetail(b.id)
      if (!detailA || !detailB) continue
      pairs.push({ a: detailA, b: detailB, score, reason: reasons.join(' · ') })
    }
  }

  pairs.sort((x, y) => y.score - x.score)

  const internal: InternalDuplicate[] = []
  for (const r of db.query(
    `SELECT e.contact_id, k.visningsnavn, lower(e.email) AS v, group_concat(e.id, '|') AS ids, count(*) AS n
     FROM contactmate_email e JOIN contactmate_contact k ON k.id = e.contact_id
     GROUP BY e.contact_id, lower(e.email) HAVING count(*) > 1`,
  ).all() as { contact_id: string; visningsnavn: string; v: string; ids: string }[]) {
    internal.push({ contact_id: r.contact_id, visningsnavn: r.visningsnavn, type: 'email', vaerdi: r.v, ids: r.ids.split('|') })
  }
  for (const r of db.query(
    `SELECT t.contact_id, k.visningsnavn,
            replace(replace(replace(replace(t.nummer,' ',''),'-',''),'+',''),'(','') AS v,
            group_concat(t.id, '|') AS ids, count(*) AS n
     FROM contactmate_phone t JOIN contactmate_contact k ON k.id = t.contact_id
     GROUP BY t.contact_id, replace(replace(replace(replace(t.nummer,' ',''),'-',''),'+',''),'(','')
     HAVING count(*) > 1`,
  ).all() as { contact_id: string; visningsnavn: string; v: string; ids: string }[]) {
    internal.push({ contact_id: r.contact_id, visningsnavn: r.visningsnavn, type: 'telefon', vaerdi: r.v, ids: r.ids.split('|') })
  }

  return { pairs, internal }
}

export function ignoreDuplicate(idA: string, idB: string) {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
  db.query('INSERT OR IGNORE INTO contactmate_ignored_duplicate (id_a, id_b) VALUES (?, ?)').run(a, b)
}

export function listIgnoredPairs() {
  return db.query(
    `SELECT i.id_a, i.id_b, ka.visningsnavn AS navn_a, kb.visningsnavn AS navn_b
     FROM contactmate_ignored_duplicate i
     LEFT JOIN contactmate_contact ka ON ka.id = i.id_a
     LEFT JOIN contactmate_contact kb ON kb.id = i.id_b
     ORDER BY ka.visningsnavn`,
  ).all() as { id_a: string; id_b: string; navn_a: string | null; navn_b: string | null }[]
}

export function removeIgnoredPair(idA: string, idB: string) {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
  db.query('DELETE FROM contactmate_ignored_duplicate WHERE id_a = ? AND id_b = ?').run(a, b)
}

export function mergeContacts(input: MergeInput) {
  const lostGoogleIdRow = db.query('SELECT google_id FROM contactmate_contact WHERE id = ?').get(input.delete_id) as
    | { google_id: string | null }
    | null

  db.query(
    `UPDATE contactmate_contact SET fornavn = ?, efternavn = ?, firma = ?, titel = ?, noter = ?,
       lokalt_redigeret = 1, ny_fra_google = 0 WHERE id = ?`,
  ).run(input.fornavn, input.efternavn, input.firma, input.titel, input.noter, input.keep_id)

  db.query('UPDATE contactmate_email SET lokalt_redigeret = 1 WHERE contact_id = ?').run(input.keep_id)
  db.query('UPDATE contactmate_phone SET lokalt_redigeret = 1 WHERE contact_id = ?').run(input.keep_id)

  const existingEmails = new Set(
    (db.query('SELECT lower(email) AS e FROM contactmate_email WHERE contact_id = ?').all(input.keep_id) as { e: string }[]).map(r => r.e),
  )
  for (const row of db.query('SELECT email, type FROM contactmate_email WHERE contact_id = ?').all(input.delete_id) as {
    email: string; type: string | null
  }[]) {
    if (!existingEmails.has(row.email.toLowerCase())) {
      db.query('INSERT INTO contactmate_email (contact_id, email, type, primaer, lokalt_redigeret) VALUES (?, ?, ?, 0, 1)').run(
        input.keep_id, row.email, row.type,
      )
    }
  }

  const existingPhones = new Set(
    (db.query('SELECT nummer FROM contactmate_phone WHERE contact_id = ?').all(input.keep_id) as { nummer: string }[]).map(r => r.nummer),
  )
  for (const row of db.query('SELECT nummer, type FROM contactmate_phone WHERE contact_id = ?').all(input.delete_id) as {
    nummer: string; type: string | null
  }[]) {
    if (!existingPhones.has(row.nummer)) {
      db.query('INSERT INTO contactmate_phone (contact_id, nummer, type, primaer, lokalt_redigeret) VALUES (?, ?, ?, 0, 1)').run(
        input.keep_id, row.nummer, row.type,
      )
    }
  }

  if (lostGoogleIdRow?.google_id) {
    db.query('INSERT OR IGNORE INTO contactmate_deleted_google_id (google_id) VALUES (?)').run(lostGoogleIdRow.google_id)
  }
  db.query('DELETE FROM contactmate_contact WHERE id = ?').run(input.delete_id)
}

export function removeInternalDuplicates(ids: string[], keepId: string) {
  let contactId: string | null = null
  const emailRow = db.query('SELECT contact_id FROM contactmate_email WHERE id = ?').get(keepId) as { contact_id: string } | null
  if (emailRow) contactId = emailRow.contact_id
  else {
    const phoneRow = db.query('SELECT contact_id FROM contactmate_phone WHERE id = ?').get(keepId) as { contact_id: string } | null
    if (phoneRow) contactId = phoneRow.contact_id
  }

  for (const id of ids) {
    if (id === keepId) continue
    const email = db.query('SELECT email, contact_id FROM contactmate_email WHERE id = ?').get(id) as
      | { email: string; contact_id: string }
      | null
    if (email) {
      db.query('INSERT OR IGNORE INTO contactmate_deleted_email (contact_id, email) VALUES (?, ?)').run(
        email.contact_id, email.email.toLowerCase(),
      )
      db.query('DELETE FROM contactmate_email WHERE id = ?').run(id)
      continue
    }
    const phone = db.query('SELECT nummer, contact_id FROM contactmate_phone WHERE id = ?').get(id) as
      | { nummer: string; contact_id: string }
      | null
    if (phone) {
      db.query('INSERT OR IGNORE INTO contactmate_deleted_phone (contact_id, nummer) VALUES (?, ?)').run(
        phone.contact_id, digitsOnly(phone.nummer),
      )
      db.query('DELETE FROM contactmate_phone WHERE id = ?').run(id)
    }
  }

  if (contactId) {
    db.query('UPDATE contactmate_contact SET lokalt_redigeret = 1 WHERE id = ?').run(contactId)
    db.query('UPDATE contactmate_email SET lokalt_redigeret = 1 WHERE contact_id = ?').run(contactId)
    db.query('UPDATE contactmate_phone SET lokalt_redigeret = 1 WHERE contact_id = ?').run(contactId)
  }
}

// ── Eksport ──────────────────────────────────────────────────────────────────────

function allContactsWithDetails(): { c: Contact; emails: string[]; phones: string[] }[] {
  const contacts = db.query('SELECT * FROM contactmate_contact ORDER BY visningsnavn ASC').all() as Contact[]
  return contacts.map(c => ({
    c,
    emails: (db.query('SELECT email FROM contactmate_email WHERE contact_id = ?').all(c.id) as { email: string }[]).map(r => r.email),
    phones: (db.query('SELECT nummer FROM contactmate_phone WHERE contact_id = ?').all(c.id) as { nummer: string }[]).map(r => r.nummer),
  }))
}

const csvField = (v: string) => (v.includes(';') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)

export function exportCsv(): string {
  const rows = allContactsWithDetails()
  let csv = 'Fornavn;Efternavn;Firma;Titel;Email;Telefon;Fødselsdag;Gade;By;Postnr;Land;Noter\r\n'
  for (const { c, emails, phones } of rows) {
    csv += [
      c.fornavn ?? '', c.efternavn ?? '', c.firma ?? '', c.titel ?? '',
      emails.join(', '), phones.join(', '), c.foedselsdag ?? '',
      c.adresse_gade ?? '', c.adresse_by ?? '', c.adresse_postnr ?? '', c.adresse_land ?? '', c.noter ?? '',
    ].map(csvField).join(';') + '\r\n'
  }
  return '\uFEFF' + csv
}

const vcardEscape = (v: string) => v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')

export function exportVcard(): string {
  const rows = allContactsWithDetails()
  let vcf = ''
  for (const { c, emails, phones } of rows) {
    vcf += 'BEGIN:VCARD\r\nVERSION:3.0\r\n'
    vcf += `N:${vcardEscape(c.efternavn ?? '')};${vcardEscape(c.fornavn ?? '')};;;\r\n`
    vcf += `FN:${vcardEscape(c.visningsnavn)}\r\n`
    if (c.firma) vcf += `ORG:${vcardEscape(c.firma)}\r\n`
    if (c.titel) vcf += `TITLE:${vcardEscape(c.titel)}\r\n`
    for (const e of emails) vcf += `EMAIL:${vcardEscape(e)}\r\n`
    for (const t of phones) vcf += `TEL:${vcardEscape(t)}\r\n`
    if (c.adresse_gade || c.adresse_by || c.adresse_postnr || c.adresse_land) {
      vcf += `ADR:;;${vcardEscape(c.adresse_gade ?? '')};${vcardEscape(c.adresse_by ?? '')};;${vcardEscape(c.adresse_postnr ?? '')};${vcardEscape(c.adresse_land ?? '')}\r\n`
    }
    if (c.foedselsdag) vcf += `BDAY:${c.foedselsdag}\r\n`
    if (c.noter) vcf += `NOTE:${vcardEscape(c.noter)}\r\n`
    vcf += 'END:VCARD\r\n'
  }
  return vcf
}
