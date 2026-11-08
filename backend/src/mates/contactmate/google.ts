import { db } from '../../db'
import { autoClassify } from './contacts'
import { getValidAccessToken } from './oauth'

/**
 * Google Contacts (People API) to-vejs sync. Port af Tauri-udgavens `sync_kontakter`/`sync_til_google`.
 * Pull respekterer `lokalt_redigeret` (lokale ændringer overskrives ikke) og de "slettet"-lister, der
 * forhindrer en genoplivning af noget brugeren har fjernet. Push sender kun kontakter med
 * `lokalt_redigeret = 1`, og kræver en frisk etag pr. kontakt (Googles optimistiske lås).
 */

export const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts'

interface GoogleFieldMetadata {
  primary?: boolean
}
interface GoogleName {
  givenName?: string
  familyName?: string
  displayName?: string
  metadata?: GoogleFieldMetadata
}
interface GoogleEmailAddress {
  value: string
  type?: string
  metadata?: GoogleFieldMetadata
}
interface GooglePhoneNumber {
  value: string
  type?: string
  metadata?: GoogleFieldMetadata
}
interface GoogleOrganization {
  name?: string
  title?: string
  metadata?: GoogleFieldMetadata
}
interface GooglePhoto {
  url?: string
  default?: boolean
}
interface GoogleBirthday {
  date?: { year?: number; month?: number; day?: number }
}
interface GoogleAddress {
  streetAddress?: string
  city?: string
  postalCode?: string
  country?: string
  metadata?: GoogleFieldMetadata
}
interface GoogleMembership {
  contactGroupMembership?: { contactGroupResourceName?: string }
}
interface PersonResource {
  resourceName: string
  names?: GoogleName[]
  emailAddresses?: GoogleEmailAddress[]
  phoneNumbers?: GooglePhoneNumber[]
  organizations?: GoogleOrganization[]
  photos?: GooglePhoto[]
  birthdays?: GoogleBirthday[]
  addresses?: GoogleAddress[]
  memberships?: GoogleMembership[]
}
interface PeopleResponse {
  connections?: PersonResource[]
  nextPageToken?: string
}
interface ContactGroup {
  resourceName: string
  name?: string
  groupType?: string
}
interface ContactGroupsResponse {
  contactGroups?: ContactGroup[]
}

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Google API-fejl (${res.status}): ${await res.text()}`)
  return (await res.json()) as T
}

export interface SyncStatus {
  antal: number
  besked: string
}

export async function syncContactsFromGoogle(): Promise<SyncStatus> {
  const accessToken = await getValidAccessToken('contacts')

  const alle: PersonResource[] = []
  let pageToken: string | undefined
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections')
    url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,organizations,photos,birthdays,addresses,memberships')
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const resp = await googleGet<PeopleResponse>(url.toString(), accessToken)
    alle.push(...(resp.connections ?? []))
    pageToken = resp.nextPageToken
  } while (pageToken)

  const groupsResp = await googleGet<ContactGroupsResponse>(
    'https://people.googleapis.com/v1/contactGroups?pageSize=200',
    accessToken,
  ).catch(() => ({ contactGroups: [] }) as ContactGroupsResponse)

  let nyeKontakter = 0
  let nyeEmails = 0
  let nyeTelefoner = 0

  for (const gruppe of groupsResp.contactGroups ?? []) {
    if (gruppe.groupType !== 'USER_CONTACT_GROUP') continue
    const navn = gruppe.name ?? gruppe.resourceName
    db.query(
      `INSERT INTO contactmate_group (google_id, navn) VALUES (?, ?)
       ON CONFLICT(google_id) DO UPDATE SET navn = excluded.navn`,
    ).run(gruppe.resourceName, navn)
  }

  for (const person of alle) {
    const googleId = person.resourceName
    const erSlettet = db.query('SELECT 1 FROM contactmate_deleted_google_id WHERE google_id = ?').get(googleId)
    if (erSlettet) continue

    const primaryName = person.names?.find(n => n.metadata?.primary) ?? person.names?.[0]
    const fornavn = primaryName?.givenName ?? null
    const efternavn = primaryName?.familyName ?? null
    const visningsnavn = primaryName?.displayName ?? googleId

    const primaryOrg = person.organizations?.find(o => o.metadata?.primary) ?? person.organizations?.[0]
    const firma = primaryOrg?.name ?? null
    const titel = primaryOrg?.title ?? null
    const fotoUrl = person.photos?.find(p => p.default !== true)?.url ?? null

    const bday = person.birthdays?.map(b => b.date).find(d => d?.month && d?.day)
    const foedselsdag = bday ? `${String(bday.year ?? 0).padStart(4, '0')}-${String(bday.month).padStart(2, '0')}-${String(bday.day).padStart(2, '0')}` : null
    const foedselsdagUdenAar = bday ? bday.year == null : false

    const primaryAddr = person.addresses?.find(a => a.metadata?.primary) ?? person.addresses?.[0]
    const adresseGade = primaryAddr?.streetAddress ?? null
    const adresseBy = primaryAddr?.city ?? null
    const adressePostnr = primaryAddr?.postalCode ?? null
    const adresseLand = primaryAddr?.country ?? null

    const existing = db.query('SELECT id, lokalt_redigeret FROM contactmate_contact WHERE google_id = ?').get(googleId) as
      | { id: string; lokalt_redigeret: number }
      | null

    let contactId: string
    if (!existing) {
      db.query(
        `INSERT INTO contactmate_contact
           (google_id, fornavn, efternavn, visningsnavn, firma, titel, foto_url,
            foedselsdag, foedselsdag_uden_aar, adresse_gade, adresse_by, adresse_postnr, adresse_land,
            synced_at, lokalt_redigeret, ny_fra_google)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0, 1)`,
      ).run(
        googleId, fornavn, efternavn, visningsnavn, firma, titel, fotoUrl,
        foedselsdag, foedselsdagUdenAar ? 1 : 0, adresseGade, adresseBy, adressePostnr, adresseLand,
      )
      nyeKontakter++
      contactId = (db.query('SELECT id FROM contactmate_contact WHERE google_id = ?').get(googleId) as { id: string }).id
    } else {
      contactId = existing.id
      if (existing.lokalt_redigeret === 0) {
        db.query(
          `UPDATE contactmate_contact SET
             fornavn = ?, efternavn = ?, visningsnavn = ?, firma = ?, titel = ?, foto_url = ?,
             foedselsdag = ?, foedselsdag_uden_aar = ?, adresse_gade = ?, adresse_by = ?, adresse_postnr = ?, adresse_land = ?,
             synced_at = datetime('now'), ny_fra_google = 0
           WHERE id = ?`,
        ).run(
          fornavn, efternavn, visningsnavn, firma, titel, fotoUrl,
          foedselsdag, foedselsdagUdenAar ? 1 : 0, adresseGade, adresseBy, adressePostnr, adresseLand,
          contactId,
        )
      }
    }

    db.query('DELETE FROM contactmate_contact_group WHERE contact_id = ?').run(contactId)
    for (const m of person.memberships ?? []) {
      const gid = m.contactGroupMembership?.contactGroupResourceName
      if (gid) db.query('INSERT OR IGNORE INTO contactmate_contact_group (contact_id, group_id) VALUES (?, ?)').run(contactId, gid)
    }

    for (const email of person.emailAddresses ?? []) {
      const emailLower = email.value.toLowerCase()
      const findes = db.query('SELECT 1 FROM contactmate_email WHERE contact_id = ? AND lower(email) = ?').get(contactId, emailLower)
      const erSlettetEmail = db.query('SELECT 1 FROM contactmate_deleted_email WHERE contact_id = ? AND email = ?').get(contactId, emailLower)
      if (!findes && !erSlettetEmail) {
        const primaer = email.metadata?.primary ?? false
        const klass = autoClassify(email.value)
        db.query(
          `INSERT INTO contactmate_email (contact_id, email, type, primaer, klassificering, lokalt_redigeret, ny_fra_google)
           VALUES (?, ?, ?, ?, ?, 0, 1)`,
        ).run(contactId, email.value, email.type ?? null, primaer ? 1 : 0, klass)
        nyeEmails++
      }
    }

    for (const phone of person.phoneNumbers ?? []) {
      const norm = phone.value.replace(/\D/g, '')
      const suffix = norm.slice(Math.max(0, norm.length - 8))
      const findes = db
        .query(
          `SELECT 1 FROM contactmate_phone
           WHERE contact_id = ? AND replace(replace(replace(nummer,' ',''),'-',''),'+','') LIKE ?`,
        )
        .get(contactId, `%${suffix}%`)
      const erSlettetPhone = db.query('SELECT 1 FROM contactmate_deleted_phone WHERE contact_id = ? AND nummer = ?').get(contactId, norm)
      if (!findes && !erSlettetPhone) {
        const primaer = phone.metadata?.primary ?? false
        db.query('INSERT INTO contactmate_phone (contact_id, nummer, type, primaer, lokalt_redigeret, ny_fra_google) VALUES (?, ?, ?, ?, 0, 1)').run(
          contactId, phone.value, phone.type ?? null, primaer ? 1 : 0,
        )
        nyeTelefoner++
      }
    }
  }

  const besked =
    nyeKontakter + nyeEmails + nyeTelefoner === 0
      ? `Alt er opdateret — ${alle.length} kontakter`
      : `${nyeKontakter} nye kontakter · ${nyeEmails} nye emails · ${nyeTelefoner} nye telefoner`

  return { antal: alle.length, besked }
}

/** Sletter en kontakt hos Google (ignorerer 404 — kontakten er allerede væk der). */
export async function deleteContactAtGoogle(googleId: string): Promise<void> {
  const accessToken = await getValidAccessToken('contacts')
  const res = await fetch(`https://people.googleapis.com/v1/${googleId}:deleteContact`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404) throw new Error(`Kunne ikke slette hos Google (${res.status}): ${await res.text()}`)
}

// ── Push (sync_til_google) ──────────────────────────────────────────────────────

interface UpdatePersonBody {
  etag: string
  names?: { givenName?: string; familyName?: string }[]
  organizations?: { name?: string; title?: string }[]
  emailAddresses?: { value: string; type?: string }[]
  phoneNumbers?: { value: string; type?: string }[]
  birthdays?: { date: { year?: number; month: number; day: number } }[]
  addresses?: { streetAddress?: string; city?: string; postalCode?: string; country?: string }[]
}

const GOOGLE_BATCH_SIZE = 200

export interface SyncToGoogleStatus {
  opdateret: number
  fejlede: number
  besked: string
}

export async function syncContactsToGoogle(): Promise<SyncToGoogleStatus> {
  const accessToken = await getValidAccessToken('contacts')

  const lokaltRedigerede = db.query(
    `SELECT id, google_id, fornavn, efternavn, firma, titel,
            foedselsdag, foedselsdag_uden_aar, adresse_gade, adresse_by, adresse_postnr, adresse_land
     FROM contactmate_contact WHERE lokalt_redigeret = 1 AND google_id IS NOT NULL`,
  ).all() as {
    id: string; google_id: string; fornavn: string | null; efternavn: string | null; firma: string | null; titel: string | null
    foedselsdag: string | null; foedselsdag_uden_aar: number; adresse_gade: string | null; adresse_by: string | null
    adresse_postnr: string | null; adresse_land: string | null
  }[]

  if (!lokaltRedigerede.length) return { opdateret: 0, fejlede: 0, besked: 'Ingen lokale ændringer at sende til Google' }

  interface Klar { contactId: string; googleId: string; body: UpdatePersonBody; maske: string }
  const klare: Klar[] = []

  for (const k of lokaltRedigerede) {
    const emails = db.query(
      `SELECT email, type FROM contactmate_email WHERE contact_id = ? AND email NOT IN
         (SELECT email FROM contactmate_deleted_email WHERE contact_id = ?)`,
    ).all(k.id, k.id) as { email: string; type: string | null }[]
    const phones = db.query('SELECT nummer, type FROM contactmate_phone WHERE contact_id = ?').all(k.id) as {
      nummer: string; type: string | null
    }[]

    let birthday: UpdatePersonBody['birthdays']
    if (k.foedselsdag) {
      const [yearStr, monthStr, dayStr] = k.foedselsdag.split('-')
      const month = Number(monthStr)
      const day = Number(dayStr)
      if (month && day) {
        const year = k.foedselsdag_uden_aar ? undefined : Number(yearStr) || undefined
        birthday = [{ date: { year, month, day } }]
      }
    }

    const hasAddress = k.adresse_gade || k.adresse_by || k.adresse_postnr || k.adresse_land
    const felter = ['names']
    const organizations = k.firma || k.titel ? (felter.push('organizations'), [{ name: k.firma ?? undefined, title: k.titel ?? undefined }]) : undefined
    const emailAddresses = emails.length
      ? (felter.push('emailAddresses'), emails.map(e => ({ value: e.email, type: e.type ?? undefined })))
      : undefined
    const phoneNumbers = phones.length
      ? (felter.push('phoneNumbers'), phones.map(p => ({ value: p.nummer, type: p.type ?? undefined })))
      : undefined
    if (birthday) felter.push('birthdays')
    const addresses = hasAddress
      ? (felter.push('addresses'),
        [{ streetAddress: k.adresse_gade ?? undefined, city: k.adresse_by ?? undefined, postalCode: k.adresse_postnr ?? undefined, country: k.adresse_land ?? undefined }])
      : undefined

    const body: UpdatePersonBody = {
      etag: '',
      names: [{ givenName: k.fornavn ?? undefined, familyName: k.efternavn ?? undefined }],
      organizations, emailAddresses, phoneNumbers, birthdays: birthday, addresses,
    }
    klare.push({ contactId: k.id, googleId: k.google_id, body, maske: felter.join(',') })
  }

  let opdateret = 0
  let fejlede = 0

  const etagFor = new Map<string, string>()
  for (let i = 0; i < klare.length; i += GOOGLE_BATCH_SIZE) {
    const chunk = klare.slice(i, i + GOOGLE_BATCH_SIZE)
    const url = new URL('https://people.googleapis.com/v1/people:batchGet')
    url.searchParams.set('personFields', 'names')
    for (const k of chunk) url.searchParams.append('resourceNames', k.googleId)
    try {
      const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      if (resp.ok) {
        const parsed = (await resp.json()) as { responses?: { person?: { resourceName: string; etag?: string } }[] }
        for (const item of parsed.responses ?? []) {
          if (item.person?.etag) etagFor.set(item.person.resourceName, item.person.etag)
        }
      }
    } catch {
      // batchGet-fejl for denne chunk — kontakterne ender uden etag og springes over nedenfor
    }
  }

  const klarTilPush = klare.filter(k => etagFor.has(k.googleId))
  fejlede += klare.length - klarTilPush.length
  for (const k of klarTilPush) k.body.etag = etagFor.get(k.googleId)!

  const grupper = new Map<string, Klar[]>()
  for (const k of klarTilPush) grupper.set(k.maske, [...(grupper.get(k.maske) ?? []), k])

  for (const [maske, gruppe] of grupper) {
    for (let i = 0; i < gruppe.length; i += GOOGLE_BATCH_SIZE) {
      const chunk = gruppe.slice(i, i + GOOGLE_BATCH_SIZE)
      const contacts: Record<string, UpdatePersonBody> = {}
      for (const k of chunk) contacts[k.googleId] = k.body
      try {
        const resp = await fetch('https://people.googleapis.com/v1/people:batchUpdateContacts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts, updateMask: maske }),
        })
        if (resp.ok) {
          for (const k of chunk) {
            db.query(`UPDATE contactmate_contact SET lokalt_redigeret = 0, synced_at = datetime('now') WHERE id = ?`).run(k.contactId)
          }
          opdateret += chunk.length
        } else {
          fejlede += chunk.length
        }
      } catch {
        fejlede += chunk.length
      }
    }
  }

  const besked =
    opdateret === 0 && fejlede === 0
      ? 'Ingen lokale ændringer at sende til Google'
      : fejlede === 0
        ? `${opdateret} kontakter synkroniseret til Google`
        : opdateret === 0
          ? `${fejlede} kontakter fejlede`
          : `${opdateret} synkroniseret · ${fejlede} fejlede`

  return { opdateret, fejlede, besked }
}
