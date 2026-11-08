import { Elysia, t } from 'elysia'
import { HttpError, httpErrors, notFound } from '../../lib/http'
import {
  acceptGoogleData, deleteContactLocal, deleteEmail, deletePhone, exportCsv, exportVcard, findDuplicates,
  getContactDetail, ignoreDuplicate, listContacts, listGroups, listIgnoredPairs, mergeContacts,
  removeIgnoredPair, removeInternalDuplicates, updateContact, updateEmail, updatePhone,
  type MergeInput, type UpdateContactInput, type UpdateEmailInput,
} from './contacts'
import { CONTACTS_SCOPE, deleteContactAtGoogle, syncContactsFromGoogle, syncContactsToGoogle } from './google'
import { GMAIL_SCOPE, syncGmail } from './gmail'
import {
  applyLinkedInEnrichment, approveLinkedInMatch, getHiddenLinkedInMatches, getLinkedInConnections,
  getLinkedInMatches, hideLinkedInMatch, importLinkedInCsv, rejectLinkedInMatch,
} from './linkedin'
import { buildAuthUrl, completeOAuthFlow, disconnectOAuth, getClientCredentials, oauthStatus, saveClientCredentials } from './oauth'

/**
 * ContactMate — kontakter med Google Contacts-sync, dublet-håndtering, LinkedIn-berigelse og
 * Gmail-baseret "sidst kontaktet"-statistik. Port af den oprindelige Tauri-app; se google.ts/gmail.ts
 * for hvorfor OAuth-flowet er en server-side redirect/callback her i stedet for en lokal TCP-listener.
 */

const BASE_URL = process.env.CONTACTMATE_BASE_URL ?? 'http://localhost:3000'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const CONTACTS_REDIRECT_URI = `${BASE_URL}/contactmate/oauth/contacts/callback`
const GMAIL_REDIRECT_URI = `${BASE_URL}/contactmate/oauth/gmail/callback`

async function withUpstreamError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new HttpError(502, (e as Error).message)
  }
}

const nullableString = t.Optional(t.Union([t.String(), t.Null()]))

export const contactmate = new Elysia({ prefix: '/contactmate' })
  .use(httpErrors)

  // ── Indstillinger (Google OAuth-klient) ──────────────────────────────────────
  .get('/settings', () => ({
    google_client_id: getClientCredentials().clientId,
    has_google_client_secret: !!getClientCredentials().clientSecret,
    contacts: oauthStatus('contacts'),
    gmail: oauthStatus('gmail'),
  }))
  .post('/settings', ({ body }) => {
    saveClientCredentials(body.google_client_id, body.google_client_secret)
    return { ok: true }
  }, { body: t.Object({ google_client_id: t.Optional(t.String()), google_client_secret: t.Optional(t.String()) }) })

  // ── Google Contacts OAuth + sync ─────────────────────────────────────────────
  .get('/oauth/contacts/start', ({ redirect }) => {
    try {
      return redirect(buildAuthUrl('contacts', CONTACTS_SCOPE, CONTACTS_REDIRECT_URI))
    } catch (e) {
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?error=${encodeURIComponent((e as Error).message)}`)
    }
  })
  .get('/oauth/contacts/callback', async ({ query, redirect }) => {
    const { code, state, error } = query as { code?: string; state?: string; error?: string }
    try {
      if (error) throw new Error(`Google afviste forbindelsen: ${error}`)
      if (!code || !state) throw new Error('Mangler code/state fra Google')
      await completeOAuthFlow('contacts', code, state, CONTACTS_REDIRECT_URI)
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?connected=contacts`)
    } catch (e) {
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?error=${encodeURIComponent((e as Error).message)}`)
    }
  })
  .post('/oauth/contacts/disconnect', () => {
    disconnectOAuth('contacts')
    return { ok: true }
  })

  // ── Gmail OAuth + sync ───────────────────────────────────────────────────────
  .get('/oauth/gmail/start', ({ redirect }) => {
    try {
      return redirect(buildAuthUrl('gmail', GMAIL_SCOPE, GMAIL_REDIRECT_URI))
    } catch (e) {
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?error=${encodeURIComponent((e as Error).message)}`)
    }
  })
  .get('/oauth/gmail/callback', async ({ query, redirect }) => {
    const { code, state, error } = query as { code?: string; state?: string; error?: string }
    try {
      if (error) throw new Error(`Google afviste forbindelsen: ${error}`)
      if (!code || !state) throw new Error('Mangler code/state fra Google')
      await completeOAuthFlow('gmail', code, state, GMAIL_REDIRECT_URI)
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?connected=gmail`)
    } catch (e) {
      return redirect(`${FRONTEND_URL}/contactmate/indstillinger?error=${encodeURIComponent((e as Error).message)}`)
    }
  })
  .post('/oauth/gmail/disconnect', () => {
    disconnectOAuth('gmail')
    return { ok: true }
  })

  .post('/sync/pull', () => withUpstreamError(() => syncContactsFromGoogle()))
  .post('/sync/push', () => withUpstreamError(() => syncContactsToGoogle()))
  .post('/sync/gmail', () => withUpstreamError(() => syncGmail()))

  // ── Kontakter ────────────────────────────────────────────────────────────────
  .get('/contacts', ({ query }) => listContacts(query.search, query.group_id), {
    query: t.Object({ search: t.Optional(t.String()), group_id: t.Optional(t.String()) }),
  })
  .get('/contacts/:id', ({ params }) => getContactDetail(params.id) ?? (() => { throw notFound('Kontakt') })())
  .put('/contacts/:id', ({ params, body }) => {
    updateContact(params.id, body as UpdateContactInput)
    return getContactDetail(params.id)
  }, {
    body: t.Object({
      fornavn: nullableString, efternavn: nullableString, firma: nullableString, titel: nullableString,
      noter: nullableString, foedselsdag: nullableString, foedselsdag_uden_aar: t.Boolean(),
      adresse_gade: nullableString, adresse_by: nullableString, adresse_postnr: nullableString, adresse_land: nullableString,
    }),
  })
  .post('/contacts/:id/accept-google', ({ params }) => {
    acceptGoogleData(params.id)
    return { ok: true }
  })
  .delete('/contacts/:id', async ({ params }) => {
    const detail = getContactDetail(params.id)
    if (!detail) throw notFound('Kontakt')
    if (detail.contact.google_id) await withUpstreamError(() => deleteContactAtGoogle(detail.contact.google_id!))
    deleteContactLocal(params.id)
    return { ok: true }
  })

  .put('/emails/:id', ({ params, body }) => {
    updateEmail({ id: params.id, ...body } as UpdateEmailInput)
    return { ok: true }
  }, { body: t.Object({ type: nullableString, primaer: t.Boolean(), klassificering: nullableString }) })
  .delete('/emails/:id', ({ params }) => {
    deleteEmail(params.id)
    return { ok: true }
  })

  .put('/phones/:id', ({ params, body }) => {
    updatePhone(params.id, body.type ?? null, body.primaer)
    return { ok: true }
  }, { body: t.Object({ type: nullableString, primaer: t.Boolean() }) })
  .delete('/phones/:id', ({ params }) => {
    deletePhone(params.id)
    return { ok: true }
  })

  .get('/groups', () => listGroups())

  // ── Dubletter ────────────────────────────────────────────────────────────────
  .get('/duplicates', () => findDuplicates())
  .post('/duplicates/merge', ({ body }) => {
    mergeContacts(body as MergeInput)
    return { ok: true }
  }, {
    body: t.Object({
      keep_id: t.String(), delete_id: t.String(),
      fornavn: nullableString, efternavn: nullableString, firma: nullableString, titel: nullableString, noter: nullableString,
    }),
  })
  .post('/duplicates/ignore', ({ body }) => {
    ignoreDuplicate(body.id_a, body.id_b)
    return { ok: true }
  }, { body: t.Object({ id_a: t.String(), id_b: t.String() }) })
  .get('/duplicates/ignored', () => listIgnoredPairs())
  .post('/duplicates/unignore', ({ body }) => {
    removeIgnoredPair(body.id_a, body.id_b)
    return { ok: true }
  }, { body: t.Object({ id_a: t.String(), id_b: t.String() }) })
  .post('/duplicates/internal/remove', ({ body }) => {
    removeInternalDuplicates(body.ids, body.keep_id)
    return { ok: true }
  }, { body: t.Object({ ids: t.Array(t.String()), keep_id: t.String() }) })

  // ── Eksport ──────────────────────────────────────────────────────────────────
  .get('/export/csv', ({ set }) => {
    set.headers['Content-Type'] = 'text/csv; charset=utf-8'
    set.headers['Content-Disposition'] = 'attachment; filename="kontakter.csv"'
    return exportCsv()
  })
  .get('/export/vcard', ({ set }) => {
    set.headers['Content-Type'] = 'text/vcard; charset=utf-8'
    set.headers['Content-Disposition'] = 'attachment; filename="kontakter.vcf"'
    return exportVcard()
  })

  // ── LinkedIn ─────────────────────────────────────────────────────────────────
  .post('/linkedin/import', ({ body }) => {
    try {
      return importLinkedInCsv(body.csv_content)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ csv_content: t.String() }) })
  .get('/linkedin/matches', ({ query }) => getLinkedInMatches(query.unresolved_only === 'true'), {
    query: t.Object({ unresolved_only: t.Optional(t.String()) }),
  })
  .get('/linkedin/connections', () => getLinkedInConnections())
  .post('/linkedin/enrich', ({ body }) => {
    applyLinkedInEnrichment(body)
    return { ok: true }
  }, {
    body: t.Object({
      linkedin_id: t.String(), contact_id: t.String(),
      enrich_firma: t.Boolean(), enrich_titel: t.Boolean(), enrich_email: t.Boolean(),
    }),
  })
  .post('/linkedin/approve', ({ body }) => {
    approveLinkedInMatch(body.linkedin_id, body.contact_id)
    return { ok: true }
  }, { body: t.Object({ linkedin_id: t.String(), contact_id: t.String() }) })
  .post('/linkedin/reject', ({ body }) => {
    rejectLinkedInMatch(body.linkedin_id)
    return { ok: true }
  }, { body: t.Object({ linkedin_id: t.String() }) })
  .post('/linkedin/hide', ({ body }) => {
    hideLinkedInMatch(body.id)
    return { ok: true }
  }, { body: t.Object({ id: t.String() }) })
  .get('/linkedin/hidden', () => getHiddenLinkedInMatches())
