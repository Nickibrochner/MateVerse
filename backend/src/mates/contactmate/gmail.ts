import { db } from '../../db'
import { getValidAccessToken } from './oauth'

/**
 * Gmail-sync (read-only): beriger kontakter med "sidst kontaktet"-dato og antal emails. Port af
 * Tauri-udgavens lagdelte sync — aktive kontakter synkroniseres oftest, inaktive sjældnest, for ikke
 * at ramme Gmail API'ets rate-limits. Separat OAuth-forbindelse (`flow = 'gmail'`) fra Contacts.
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

interface GmailListResponse {
  messages?: { id: string }[]
  resultSizeEstimate?: number
}
interface GmailMessage {
  internalDate?: string
}

export interface GmailSyncStatus {
  lag1_kontakter: number
  lag2_kontakter: number
  lag3_kontakter: number
  opdateret: number
  besked: string
}

const toUnix = (iso: string | null): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

export async function syncGmail(): Promise<GmailSyncStatus> {
  const accessToken = await getValidAccessToken('gmail')

  const now = Math.floor(Date.now() / 1000)
  const seksMdrSiden = now - 6 * 30 * 24 * 3600
  const toAarSiden = now - 24 * 30 * 24 * 3600
  const enUgeSiden = now - 7 * 24 * 3600
  const enMaanedSiden = now - 30 * 24 * 3600

  interface KontaktSync { id: string; emails: string[]; sidstKontakt: number | null; sidstSync: number | null }

  const rows = db.query(
    `SELECT k.id, k.sidst_kontakt_at, k.sidst_gmail_sync, group_concat(lower(e.email), '|') AS emails
     FROM contactmate_contact k JOIN contactmate_email e ON e.contact_id = k.id
     GROUP BY k.id`,
  ).all() as { id: string; sidst_kontakt_at: string | null; sidst_gmail_sync: string | null; emails: string | null }[]

  const kontakterMedEmails: KontaktSync[] = rows
    .map(r => ({
      id: r.id,
      emails: (r.emails ?? '').split('|').filter(Boolean),
      sidstKontakt: toUnix(r.sidst_kontakt_at),
      sidstSync: toUnix(r.sidst_gmail_sync),
    }))
    .filter(k => k.emails.length > 0)

  const lag1: KontaktSync[] = []
  const lag2: KontaktSync[] = []
  const lag3: KontaktSync[] = []
  let nyeAldrigSynket = 0

  for (const k of kontakterMedEmails) {
    const aldrigSynket = k.sidstSync == null
    const syncForGammeltUge = k.sidstSync == null || k.sidstSync < enUgeSiden
    const syncForGammeltMdr = k.sidstSync == null || k.sidstSync < enMaanedSiden
    const aktiv = k.sidstKontakt != null && k.sidstKontakt > seksMdrSiden
    const semi = k.sidstKontakt != null && k.sidstKontakt > toAarSiden && k.sidstKontakt <= seksMdrSiden

    if (aktiv || (aldrigSynket && nyeAldrigSynket < 50)) {
      if (aldrigSynket) nyeAldrigSynket++
      lag1.push(k)
    } else if (semi && syncForGammeltUge) {
      lag2.push(k)
    } else if (syncForGammeltMdr) {
      lag3.push(k)
    }
  }

  let opdateret = 0
  for (const kontakt of [...lag1, ...lag2, ...lag3]) {
    const emailQuery = kontakt.emails.map(e => `from:${e} OR to:${e}`).join(' OR ')
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(emailQuery)}&maxResults=1&orderBy=date`

    let antal = 0
    let sidstDato: string | null = null
    try {
      const listResp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (listResp.ok) {
        const list = (await listResp.json()) as GmailListResponse
        antal = list.resultSizeEstimate ?? 0
        const msgRef = list.messages?.[0]
        if (msgRef) {
          const msgResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=metadata&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          if (msgResp.ok) {
            const msg = (await msgResp.json()) as GmailMessage
            if (msg.internalDate) sidstDato = new Date(Number(msg.internalDate)).toISOString()
          }
        }
      }
    } catch {
      continue
    }

    db.query(
      `UPDATE contactmate_contact SET antal_emails = ?, sidst_kontakt_at = COALESCE(?, sidst_kontakt_at), sidst_gmail_sync = ? WHERE id = ?`,
    ).run(antal, sidstDato, new Date(now * 1000).toISOString(), kontakt.id)
    opdateret++

    await new Promise(r => setTimeout(r, 200))
  }

  const besked = `Gmail sync: ${lag1.length} aktive · ${lag2.length} semi-aktive · ${lag3.length} inaktive · ${opdateret} opdateret`

  return { lag1_kontakter: lag1.length, lag2_kontakter: lag2.length, lag3_kontakter: lag3.length, opdateret, besked }
}
