import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Testene kører mod en tom database i en midlertidig mappe
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'contactmate-')), 'test.sqlite')

let contacts: typeof import('./contacts')
let linkedin: typeof import('./linkedin')
let settings: typeof import('./settings')
let db: typeof import('../../db').db

beforeAll(async () => {
  contacts = await import('./contacts')
  linkedin = await import('./linkedin')
  settings = await import('./settings')
  ;({ db } = await import('../../db'))
})

let seq = 0
function seedContact(fields: Partial<{ fornavn: string; efternavn: string; visningsnavn: string; firma: string; google_id: string }>) {
  const id = `c${++seq}`
  const visningsnavn = fields.visningsnavn ?? `${fields.fornavn ?? ''} ${fields.efternavn ?? ''}`.trim()
  db.query(
    `INSERT INTO contactmate_contact (id, google_id, fornavn, efternavn, visningsnavn, firma) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, fields.google_id ?? null, fields.fornavn ?? null, fields.efternavn ?? null, visningsnavn, fields.firma ?? null)
  return id
}
function seedEmail(contactId: string, email: string, primaer = false) {
  db.query('INSERT INTO contactmate_email (contact_id, email, primaer) VALUES (?, ?, ?)').run(contactId, email, primaer ? 1 : 0)
}
function seedPhone(contactId: string, nummer: string) {
  db.query('INSERT INTO contactmate_phone (contact_id, nummer) VALUES (?, ?)').run(contactId, nummer)
}

describe('auto-klassificering af email', () => {
  test('kendte private domæner', () => {
    expect(contacts.autoClassify('mads@gmail.com')).toBe('auto_privat')
    expect(contacts.autoClassify('MADS@Hotmail.DK')).toBe('auto_privat')
  })
  test('alt andet klassificeres som arbejde', () => {
    expect(contacts.autoClassify('mads@firma.dk')).toBe('auto_arbejde')
  })
})

describe('navne-matching', () => {
  test('normalize sænker, fjerner punktum og kollapser whitespace', () => {
    expect(contacts.normalize('Mads  C. Jensen')).toBe('mads c jensen')
  })
  test('nameSimilarity beregner delt token-andel', () => {
    expect(contacts.nameSimilarity('mads christian jensen', 'mads jensen')).toBe(67)
    expect(contacts.nameSimilarity('mads jensen', 'mads jensen')).toBe(100)
    expect(contacts.nameSimilarity('mads jensen', 'peter hansen')).toBe(0)
  })
})

describe('kontakter — CRUD', () => {
  test('update_kontakt genberegner visningsnavn og sætter lokalt_redigeret', () => {
    const id = seedContact({ fornavn: 'Mads', efternavn: 'Jensen' })
    contacts.updateContact(id, {
      fornavn: 'Mads', efternavn: 'Jensen-Hansen', firma: 'Firma A/S', titel: 'CTO', noter: null,
      foedselsdag: null, foedselsdag_uden_aar: false, adresse_gade: null, adresse_by: null, adresse_postnr: null, adresse_land: null,
    })
    const detail = contacts.getContactDetail(id)!
    expect(detail.contact.visningsnavn).toBe('Mads Jensen-Hansen')
    expect(detail.contact.firma).toBe('Firma A/S')
    expect(detail.contact.lokalt_redigeret).toBe(1)
  })

  test('accepter_google_data nulstiller lokalt_redigeret/ny_fra_google', () => {
    const id = seedContact({ fornavn: 'Eva', efternavn: 'Berg' })
    db.query('UPDATE contactmate_contact SET lokalt_redigeret = 1, ny_fra_google = 1 WHERE id = ?').run(id)
    contacts.acceptGoogleData(id)
    const detail = contacts.getContactDetail(id)!
    expect(detail.contact.lokalt_redigeret).toBe(0)
    expect(detail.contact.ny_fra_google).toBe(0)
  })

  test('slet_kontakt uden google_id sletter bare lokalt', () => {
    const id = seedContact({ fornavn: 'Uden', efternavn: 'Google' })
    const googleId = contacts.deleteContactLocal(id)
    expect(googleId).toBeNull()
    expect(contacts.getContactDetail(id)).toBeNull()
  })
})

describe('dublet-scanning', () => {
  test('identisk navn giver høj score', () => {
    const a = seedContact({ fornavn: 'Peter', efternavn: 'Hansen' })
    const b = seedContact({ fornavn: 'Peter', efternavn: 'Hansen' })
    const { pairs } = contacts.findDuplicates()
    const pair = pairs.find(p => (p.a.contact.id === a && p.b.contact.id === b) || (p.a.contact.id === b && p.b.contact.id === a))
    expect(pair).toBeDefined()
    expect(pair!.score).toBeGreaterThanOrEqual(95)
  })

  test('samme email giver et dublet-par selvom navnet er forskelligt', () => {
    const a = seedContact({ fornavn: 'Kim', efternavn: 'Olsen' })
    const b = seedContact({ fornavn: 'Kimberly', efternavn: 'O.' })
    seedEmail(a, 'kim@example.com')
    seedEmail(b, 'kim@example.com')
    const { pairs } = contacts.findDuplicates()
    const pair = pairs.find(p => new Set([p.a.contact.id, p.b.contact.id]).has(a) && new Set([p.a.contact.id, p.b.contact.id]).has(b))
    expect(pair).toBeDefined()
    expect(pair!.reason).toContain('Samme email')
  })

  test('ignorerede par udelades af scanningen og kan genaktiveres', () => {
    const a = seedContact({ fornavn: 'Ignore', efternavn: 'Me' })
    const b = seedContact({ fornavn: 'Ignore', efternavn: 'Me' })
    contacts.ignoreDuplicate(a, b)
    let { pairs } = contacts.findDuplicates()
    expect(pairs.some(p => new Set([p.a.contact.id, p.b.contact.id]).has(a))).toBe(false)
    expect(contacts.listIgnoredPairs().length).toBeGreaterThan(0)

    contacts.removeIgnoredPair(a, b)
    ;({ pairs } = contacts.findDuplicates())
    expect(pairs.some(p => new Set([p.a.contact.id, p.b.contact.id]).has(a))).toBe(true)
  })

  test('interne dubletter (samme email to gange på én kontakt) opdages og kan fjernes', () => {
    const a = seedContact({ fornavn: 'Dobbelt', efternavn: 'Email' })
    seedEmail(a, 'dobbelt@example.com')
    seedEmail(a, 'dobbelt@example.com')
    const { internal } = contacts.findDuplicates()
    const dupe = internal.find(d => d.contact_id === a)
    expect(dupe).toBeDefined()
    expect(dupe!.ids.length).toBe(2)

    contacts.removeInternalDuplicates(dupe!.ids, dupe!.ids[0])
    const emails = contacts.getContactDetail(a)!.emails
    expect(emails.length).toBe(1)
  })
})

describe('merge_kontakter', () => {
  test('flytter emails/telefoner og sletter den tabende kontakt', () => {
    const keep = seedContact({ fornavn: 'Keep', efternavn: 'Me', google_id: 'people/keep' })
    const gone = seedContact({ fornavn: 'Gone', efternavn: 'Me', google_id: 'people/gone' })
    seedEmail(gone, 'gone@example.com')
    seedPhone(gone, '12345678')

    contacts.mergeContacts({ keep_id: keep, delete_id: gone, fornavn: 'Keep', efternavn: 'Me', firma: null, titel: null, noter: null })

    expect(contacts.getContactDetail(gone)).toBeNull()
    const detail = contacts.getContactDetail(keep)!
    expect(detail.emails.some(e => e.email === 'gone@example.com')).toBe(true)
    expect(detail.phones.some(p => p.nummer === '12345678')).toBe(true)
    const tombstoned = db.query('SELECT 1 FROM contactmate_deleted_google_id WHERE google_id = ?').get('people/gone')
    expect(tombstoned).toBeTruthy()
  })
})

describe('indstillinger', () => {
  test('gemmes og hentes, ukendt nøgle giver null', () => {
    expect(settings.getSetting('google_client_id')).toBeNull()
    settings.saveSetting('google_client_id', 'abc123')
    expect(settings.getSetting('google_client_id')).toBe('abc123')
  })
})

describe('LinkedIn CSV-import', () => {
  const header = 'Notes:\nThis file contains...\n\nFirst Name,Last Name,Email Address,Company,Position,Connected On'

  test('eksakt email-match kobles automatisk (score 100)', () => {
    const id = seedContact({ fornavn: 'Anna', efternavn: 'Smith' })
    seedEmail(id, 'anna@example.com')
    const csv = `${header}\nAnna,Smith,anna@example.com,Acme,Dev,01 Jan 2024\n`
    const status = linkedin.importLinkedInCsv(csv)
    expect(status.importeret).toBe(1)
    const [match] = linkedin.getLinkedInConnections()
    expect(match.contact_id).toBe(id)
    expect(match.match_score).toBe(100)
  })

  test('eksakt navn-match uden email kobles automatisk', () => {
    const id = seedContact({ fornavn: 'Bo', efternavn: 'Nielsen' })
    const csv = `${header}\nBo,Nielsen,,Acme,Dev,01 Jan 2024\n`
    linkedin.importLinkedInCsv(csv)
    const match = linkedin.getLinkedInConnections().find(c => c.fornavn === 'Bo')!
    expect(match.contact_id).toBe(id)
    expect(match.match_score).toBe(100)
  })

  test('fuzzy navn-match (60-99) gemmes som kandidat, ikke auto-koblet', () => {
    seedContact({ fornavn: 'Christian', efternavn: 'Berg Larsen' })
    const csv = `${header}\nChristian,Larsen,,Acme,Dev,01 Jan 2024\n`
    linkedin.importLinkedInCsv(csv)
    const match = linkedin.getLinkedInConnections().find(c => c.fornavn === 'Christian' && c.efternavn === 'Larsen')!
    expect(match.contact_id).toBeNull()
    expect(match.fuzzy_kandidat_id).not.toBeNull()
    expect(match.match_score).toBeGreaterThanOrEqual(60)
    expect(match.match_score).toBeLessThan(100)
  })

  test('intet match giver score 0', () => {
    const csv = `${header}\nHelt,Ukendt,,Acme,Dev,01 Jan 2024\n`
    linkedin.importLinkedInCsv(csv)
    const match = linkedin.getLinkedInConnections().find(c => c.fornavn === 'Helt')!
    expect(match.contact_id).toBeNull()
    expect(match.match_score).toBe(0)
  })

  test('mangler header-linje giver en forståelig fejl', () => {
    expect(() => linkedin.importLinkedInCsv('Foo,Bar\n1,2')).toThrow('LinkedIn Connections.csv')
  })

  test('godkend/afvis fuzzy-match', () => {
    const id = seedContact({ fornavn: 'Fuzzy', efternavn: 'Approve Target' })
    const csv = `${header}\nFuzzy,Approve,,Acme,Dev,01 Jan 2024\n`
    linkedin.importLinkedInCsv(csv)
    const match = linkedin.getLinkedInConnections().find(c => c.fornavn === 'Fuzzy' && c.efternavn === 'Approve')!

    linkedin.approveLinkedInMatch(match.id, id)
    let updated = linkedin.getLinkedInConnections().find(c => c.id === match.id)!
    expect(updated.contact_id).toBe(id)
    expect(updated.match_score).toBe(100)

    linkedin.rejectLinkedInMatch(match.id)
    updated = linkedin.getLinkedInConnections().find(c => c.id === match.id)!
    expect(updated.fuzzy_kandidat_id).toBeNull()
    expect(updated.match_score).toBe(0)
  })
})

describe('eksport', () => {
  test('CSV starter med UTF-8 BOM og header', () => {
    const csv = contacts.exportCsv()
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Fornavn;Efternavn')
  })
  test('vCard indeholder BEGIN/END og FN', () => {
    seedContact({ fornavn: 'Vcard', efternavn: 'Test' })
    const vcf = contacts.exportVcard()
    expect(vcf).toContain('BEGIN:VCARD')
    expect(vcf).toContain('FN:Vcard Test')
    expect(vcf).toContain('END:VCARD')
  })
})
