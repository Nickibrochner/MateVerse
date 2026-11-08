import { API_URL, json, request } from '../../api'

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

export interface IgnoredPair {
  id_a: string
  id_b: string
  navn_a: string | null
  navn_b: string | null
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

export interface OAuthStatus {
  forbundet: boolean
  expires_at: string | null
}

export interface ContactMateSettings {
  google_client_id: string | null
  has_google_client_secret: boolean
  contacts: OAuthStatus
  gmail: OAuthStatus
}

export interface SyncStatus {
  antal: number
  besked: string
}

export interface SyncToGoogleStatus {
  opdateret: number
  fejlede: number
  besked: string
}

export interface GmailSyncStatus {
  lag1_kontakter: number
  lag2_kontakter: number
  lag3_kontakter: number
  opdateret: number
  besked: string
}

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

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const contactmateApi = {
  // ── Kontakter ──
  contacts: (search?: string, groupId?: string) =>
    request<Contact[]>(`/contactmate/contacts${qs({ search, group_id: groupId })}`),
  contact: (id: string) => request<ContactDetail>(`/contactmate/contacts/${id}`),
  updateContact: (id: string, input: UpdateContactInput) =>
    request<ContactDetail>(`/contactmate/contacts/${id}`, json('PUT', input)),
  acceptGoogleData: (id: string) => request(`/contactmate/contacts/${id}/accept-google`, json('POST', {})),
  deleteContact: (id: string) => request(`/contactmate/contacts/${id}`, { method: 'DELETE' }),

  updateEmail: (id: string, input: { type: string | null; primaer: boolean; klassificering: string | null }) =>
    request(`/contactmate/emails/${id}`, json('PUT', input)),
  deleteEmail: (id: string) => request(`/contactmate/emails/${id}`, { method: 'DELETE' }),
  updatePhone: (id: string, input: { type: string | null; primaer: boolean }) =>
    request(`/contactmate/phones/${id}`, json('PUT', input)),
  deletePhone: (id: string) => request(`/contactmate/phones/${id}`, { method: 'DELETE' }),

  groups: () => request<Group[]>('/contactmate/groups'),

  // ── Dubletter ──
  duplicates: () => request<DuplicateResult>('/contactmate/duplicates'),
  mergeDuplicates: (input: MergeInput) => request('/contactmate/duplicates/merge', json('POST', input)),
  ignoreDuplicate: (idA: string, idB: string) => request('/contactmate/duplicates/ignore', json('POST', { id_a: idA, id_b: idB })),
  ignoredPairs: () => request<IgnoredPair[]>('/contactmate/duplicates/ignored'),
  unignoreDuplicate: (idA: string, idB: string) => request('/contactmate/duplicates/unignore', json('POST', { id_a: idA, id_b: idB })),
  removeInternalDuplicates: (ids: string[], keepId: string) =>
    request('/contactmate/duplicates/internal/remove', json('POST', { ids, keep_id: keepId })),

  // ── Eksport (direkte browser-download) ──
  exportCsvUrl: () => `${API_URL}/contactmate/export/csv`,
  exportVcardUrl: () => `${API_URL}/contactmate/export/vcard`,

  // ── Indstillinger + OAuth ──
  settings: () => request<ContactMateSettings>('/contactmate/settings'),
  saveSettings: (input: { google_client_id?: string; google_client_secret?: string }) =>
    request('/contactmate/settings', json('POST', input)),
  contactsConnectUrl: () => `${API_URL}/contactmate/oauth/contacts/start`,
  disconnectContacts: () => request('/contactmate/oauth/contacts/disconnect', json('POST', {})),
  gmailConnectUrl: () => `${API_URL}/contactmate/oauth/gmail/start`,
  disconnectGmail: () => request('/contactmate/oauth/gmail/disconnect', json('POST', {})),

  syncPull: () => request<SyncStatus>('/contactmate/sync/pull', json('POST', {})),
  syncPush: () => request<SyncToGoogleStatus>('/contactmate/sync/push', json('POST', {})),
  syncGmail: () => request<GmailSyncStatus>('/contactmate/sync/gmail', json('POST', {})),

  // ── LinkedIn ──
  importLinkedInCsv: (csvContent: string) =>
    request<LinkedInImportStatus>('/contactmate/linkedin/import', json('POST', { csv_content: csvContent })),
  linkedInMatches: (unresolvedOnly: boolean) =>
    request<LinkedInMatch[]>(`/contactmate/linkedin/matches${qs({ unresolved_only: unresolvedOnly ? 'true' : undefined })}`),
  linkedInConnections: () => request<LinkedInConnection[]>('/contactmate/linkedin/connections'),
  enrichFromLinkedIn: (input: { linkedin_id: string; contact_id: string; enrich_firma: boolean; enrich_titel: boolean; enrich_email: boolean }) =>
    request('/contactmate/linkedin/enrich', json('POST', input)),
  approveLinkedInMatch: (linkedinId: string, contactId: string) =>
    request('/contactmate/linkedin/approve', json('POST', { linkedin_id: linkedinId, contact_id: contactId })),
  rejectLinkedInMatch: (linkedinId: string) => request('/contactmate/linkedin/reject', json('POST', { linkedin_id: linkedinId })),
  hideLinkedInMatch: (id: string) => request('/contactmate/linkedin/hide', json('POST', { id })),
  hiddenLinkedInMatches: () => request<string[]>('/contactmate/linkedin/hidden'),
}
