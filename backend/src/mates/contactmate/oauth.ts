import { createHash, randomBytes } from 'node:crypto'
import { deleteSetting, getSetting, getSettingJson, saveSetting, saveSettingJson } from './settings'

/**
 * Fælles Google OAuth (PKCE) for ContactMates to forbindelser: Contacts (`flow = 'contacts'`) og
 * Gmail (`flow = 'gmail'`). Port af Tauri-udgavens flow, som åbnede systembrowseren og lyttede på
 * en lokal TCP-port for callbacket — i en webapp bliver det i stedet en server-side redirect/callback
 * (se routes.ts). Samme Google-klient (id/secret) bruges til begge, blot med forskelligt scope.
 */

const base64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const generateVerifier = () => base64url(randomBytes(32))
const codeChallenge = (verifier: string) => base64url(createHash('sha256').update(verifier).digest())
const randomState = () => base64url(randomBytes(24))

export interface OAuthStatus {
  forbundet: boolean
  expires_at: string | null
}

export function getClientCredentials() {
  return { clientId: getSetting('google_client_id'), clientSecret: getSetting('google_client_secret') }
}

export function saveClientCredentials(clientId?: string | null, clientSecret?: string | null) {
  if (clientId) saveSetting('google_client_id', clientId)
  if (clientSecret) saveSetting('google_client_secret', clientSecret)
}

export function buildAuthUrl(flow: string, scope: string, redirectUri: string): string {
  const { clientId } = getClientCredentials()
  if (!clientId) throw new Error('Google Client ID er ikke sat — udfyld det under Indstillinger først.')
  const verifier = generateVerifier()
  const state = randomState()
  saveSettingJson(`oauth_pending_${flow}`, { state, verifier })
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function saveToken(flow: string, token: TokenResponse) {
  const expiresAt = Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600) - 60
  saveSetting(`${flow}_access_token`, token.access_token)
  if (token.refresh_token) saveSetting(`${flow}_refresh_token`, token.refresh_token)
  saveSetting(`${flow}_expires_at`, String(expiresAt))
}

export async function completeOAuthFlow(flow: string, code: string, state: string, redirectUri: string): Promise<void> {
  const pending = getSettingJson<{ state: string; verifier: string }>(`oauth_pending_${flow}`)
  if (!pending || pending.state !== state) {
    throw new Error('State mismatch — muligt CSRF-angreb, eller forbindelsen var udløbet. Prøv igen.')
  }
  const { clientId, clientSecret } = getClientCredentials()
  if (!clientId || !clientSecret) throw new Error('Google Client ID/Secret er ikke sat under Indstillinger.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: pending.verifier,
      grant_type: 'authorization_code',
    }),
  })
  const token = (await res.json()) as TokenResponse
  if (!res.ok || token.error) throw new Error(`Token-udveksling fejlede: ${token.error_description ?? token.error ?? res.status}`)
  saveToken(flow, token)
  deleteSetting(`oauth_pending_${flow}`)
}

export function oauthStatus(flow: string): OAuthStatus {
  const expiresAt = getSetting(`${flow}_expires_at`)
  return getSetting(`${flow}_access_token`) ? { forbundet: true, expires_at: expiresAt } : { forbundet: false, expires_at: null }
}

export function disconnectOAuth(flow: string) {
  deleteSetting(`${flow}_access_token`)
  deleteSetting(`${flow}_refresh_token`)
  deleteSetting(`${flow}_expires_at`)
}

export async function getValidAccessToken(flow: string): Promise<string> {
  const accessToken = getSetting(`${flow}_access_token`)
  if (!accessToken) throw new Error('Ikke forbundet til Google. Opret forbindelse under Indstillinger.')
  const expiresAt = Number(getSetting(`${flow}_expires_at`) ?? 0)
  if (Math.floor(Date.now() / 1000) < expiresAt) return accessToken

  const refreshToken = getSetting(`${flow}_refresh_token`)
  if (!refreshToken) throw new Error('Ingen refresh token. Log ind igen under Indstillinger.')
  const { clientId, clientSecret } = getClientCredentials()
  if (!clientId || !clientSecret) throw new Error('Google Client ID/Secret er ikke sat under Indstillinger.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const token = (await res.json()) as TokenResponse
  if (!res.ok || token.error) {
    disconnectOAuth(flow)
    throw new Error(
      `Forbindelsen er udløbet eller blev afvist (${token.error_description ?? token.error ?? res.status}). Opret forbindelse igen under Indstillinger.`,
    )
  }
  saveToken(flow, token)
  return token.access_token
}
