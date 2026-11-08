import { db } from '../../db'
import { autoClassify, nameSimilarity, normalize, type Contact } from './contacts'
import { parseCsv } from './csv'

/**
 * LinkedIn "Connections.csv"-import + berigelse. Port af Tauri-udgavens matching: eksakt email,
 * eksakt navn, og ellers fuzzy navne-match (≥60%) som brugeren selv skal godkende/afvise.
 */

export interface LinkedInConnection {
  id: string
  fornavn: string | null
  efternavn: string | null
  email: string | null
  firma: string | null
  titel: string | null
  forbundet_den: string | null
  contact_id: string | null
  visningsnavn: string | null
  fuzzy_kandidat_id: string | null
  match_score: number
}

export interface LinkedInMatch {
  linkedin: LinkedInConnection
  contact: Contact | null
  match_type: 'email' | 'navn' | 'ingen'
  new_fields: string[]
}

export interface LinkedInImportStatus {
  importeret: number
  matches: number
  ingen_match: number
}

export interface EnrichInput {
  linkedin_id: string
  contact_id: string
  enrich_firma: boolean
  enrich_titel: boolean
  enrich_email: boolean
}

export function importLinkedInCsv(csvContent: string): LinkedInImportStatus {
  const lines = csvContent.split(/\r\n|\r|\n/)
  const headerLine = lines.findIndex(l => l.trimStart().startsWith('First Name'))
  if (headerLine < 0) throw new Error('Kunne ikke finde header-linje — er det en LinkedIn Connections.csv?')

  const rows = parseCsv(lines.slice(headerLine).join('\n'))
  const headers = rows[0]?.map(h => h.trim()) ?? []
  const idx = (name: string) => headers.indexOf(name)
  const idxFornavn = idx('First Name')
  const idxEfternavn = idx('Last Name')
  const idxEmail = idx('Email Address')
  const idxFirma = idx('Company')
  const idxTitel = idx('Position')
  const idxForbundet = idx('Connected On')

  const alleKontakter = db.query('SELECT id, lower(visningsnavn) AS v FROM contactmate_contact').all() as { id: string; v: string }[]

  const get = (row: string[], i: number): string | null => {
    if (i < 0) return null
    const v = (row[i] ?? '').trim()
    return v || null
  }

  let importeret = 0

  for (const row of rows.slice(1)) {
    const fornavn = get(row, idxFornavn)
    const efternavn = get(row, idxEfternavn)
    const email = get(row, idxEmail)?.toLowerCase() ?? null
    const firma = get(row, idxFirma)
    const titel = get(row, idxTitel)
    const forbundet = get(row, idxForbundet)

    if (!fornavn && !efternavn && !email) continue

    let contactId: string | null = null
    if (email) {
      const row2 = db.query('SELECT contact_id FROM contactmate_email WHERE lower(email) = ? LIMIT 1').get(email) as
        | { contact_id: string }
        | null
      contactId = row2?.contact_id ?? null
    }
    if (!contactId && fornavn && efternavn) {
      const fuldtNavn = `${fornavn} ${efternavn}`.toLowerCase()
      const row2 = db.query('SELECT id FROM contactmate_contact WHERE lower(visningsnavn) = ? LIMIT 1').get(fuldtNavn) as
        | { id: string }
        | null
      contactId = row2?.id ?? null
    }

    let matchScore = 0
    if (contactId) {
      matchScore = 100
    } else if (fornavn && efternavn) {
      const liNavn = normalize(`${fornavn} ${efternavn}`)
      let besteId: string | null = null
      let besteScore = 0
      for (const k of alleKontakter) {
        const score = nameSimilarity(liNavn, k.v)
        if (score > besteScore && score >= 60) {
          besteScore = score
          besteId = k.id
        }
      }
      if (besteScore >= 60) {
        contactId = besteId
        matchScore = besteScore
      }
    }

    const autoContactId = matchScore === 100 ? contactId : null
    const fuzzyKandidatId = matchScore >= 60 && matchScore < 100 ? contactId : null

    db.query(
      `INSERT INTO contactmate_linkedin_connection
         (fornavn, efternavn, email, firma, titel, forbundet_den, contact_id, fuzzy_kandidat_id, match_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(fornavn, efternavn, email, firma, titel, forbundet, autoContactId, fuzzyKandidatId, matchScore)
    importeret++
  }

  const matches = (db.query('SELECT count(*) AS n FROM contactmate_linkedin_connection WHERE contact_id IS NOT NULL').get() as { n: number }).n
  const ingenMatch = (db.query('SELECT count(*) AS n FROM contactmate_linkedin_connection WHERE contact_id IS NULL').get() as { n: number }).n

  return { importeret, matches, ingen_match: ingenMatch }
}

export function getLinkedInMatches(unresolvedOnly: boolean): LinkedInMatch[] {
  const sql = unresolvedOnly
    ? `SELECT l.*, k.visningsnavn FROM contactmate_linkedin_connection l
       LEFT JOIN contactmate_contact k ON k.id = l.contact_id
       WHERE l.contact_id IS NOT NULL ORDER BY k.visningsnavn`
    : `SELECT l.*, k.visningsnavn FROM contactmate_linkedin_connection l
       LEFT JOIN contactmate_contact k ON k.id = l.contact_id
       ORDER BY k.visningsnavn, l.fornavn`

  const rows = db.query(sql).all() as (LinkedInConnection & { visningsnavn: string | null })[]

  const result: LinkedInMatch[] = []
  for (const row of rows) {
    const newFields: string[] = []
    let contact: Contact | null = null
    if (row.contact_id) {
      contact = db.query('SELECT * FROM contactmate_contact WHERE id = ?').get(row.contact_id) as Contact | null
      if (contact) {
        if (!contact.firma && row.firma) newFields.push('firma')
        if (!contact.titel && row.titel) newFields.push('titel')
      }
      if (row.email) {
        const has = db.query('SELECT 1 FROM contactmate_email WHERE contact_id = ? AND lower(email) = ?').get(row.contact_id, row.email)
        if (!has) newFields.push('email')
      }
    }
    const matchType: LinkedInMatch['match_type'] = !row.contact_id ? 'ingen' : row.email ? 'email' : 'navn'
    if (newFields.length === 0) continue
    result.push({ linkedin: row, contact, match_type: matchType, new_fields: newFields })
  }
  return result
}

export function getLinkedInConnections(): LinkedInConnection[] {
  return db.query(
    `SELECT l.*, k.visningsnavn FROM contactmate_linkedin_connection l
     LEFT JOIN contactmate_contact k ON k.id = l.contact_id
     ORDER BY l.fornavn, l.efternavn`,
  ).all() as LinkedInConnection[]
}

export function applyLinkedInEnrichment(input: EnrichInput) {
  const li = db.query('SELECT firma, titel, email FROM contactmate_linkedin_connection WHERE id = ?').get(input.linkedin_id) as
    | { firma: string | null; titel: string | null; email: string | null }
    | null
  if (!li) throw new Error('LinkedIn-forbindelse findes ikke')

  if (input.enrich_firma || input.enrich_titel) {
    const current = db.query('SELECT firma, titel FROM contactmate_contact WHERE id = ?').get(input.contact_id) as
      | { firma: string | null; titel: string | null }
      | null
    const firma = input.enrich_firma ? li.firma : current?.firma ?? null
    const titel = input.enrich_titel ? li.titel : current?.titel ?? null
    db.query('UPDATE contactmate_contact SET firma = ?, titel = ?, lokalt_redigeret = 1 WHERE id = ?').run(firma, titel, input.contact_id)
  }

  if (input.enrich_email && li.email) {
    const findes = db.query('SELECT 1 FROM contactmate_email WHERE contact_id = ? AND lower(email) = ?').get(
      input.contact_id, li.email.toLowerCase(),
    )
    if (!findes) {
      const klass = autoClassify(li.email)
      db.query(
        `INSERT INTO contactmate_email (contact_id, email, type, primaer, klassificering, lokalt_redigeret)
         VALUES (?, ?, 'work', 0, ?, 1)`,
      ).run(input.contact_id, li.email, klass)
    }
  }

  db.query('UPDATE contactmate_linkedin_connection SET contact_id = ? WHERE id = ?').run(input.contact_id, input.linkedin_id)
}

export function approveLinkedInMatch(linkedinId: string, contactId: string) {
  db.query('UPDATE contactmate_linkedin_connection SET contact_id = ?, fuzzy_kandidat_id = NULL, match_score = 100 WHERE id = ?').run(
    contactId, linkedinId,
  )
}

export function rejectLinkedInMatch(linkedinId: string) {
  db.query('UPDATE contactmate_linkedin_connection SET fuzzy_kandidat_id = NULL, match_score = 0 WHERE id = ?').run(linkedinId)
}

export function hideLinkedInMatch(id: string) {
  db.query('INSERT OR IGNORE INTO contactmate_linkedin_hidden (linkedin_id) VALUES (?)').run(id)
}

export function getHiddenLinkedInMatches(): string[] {
  return (db.query('SELECT linkedin_id FROM contactmate_linkedin_hidden').all() as { linkedin_id: string }[]).map(r => r.linkedin_id)
}
