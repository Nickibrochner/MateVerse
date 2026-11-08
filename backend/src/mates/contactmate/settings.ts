import { db } from '../../db'

/**
 * Nøgle/værdi-indstillinger for ContactMate: Google OAuth-klient (id/secret) og tokens for de to
 * separate forbindelser (Contacts, Gmail). Gemmes ukrypteret i `contactmate_setting`, samme aftale
 * som Stockmates krypto-nøgler.
 */
export function getSetting(key: string): string | null {
  const row = db.query('SELECT value FROM contactmate_setting WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function saveSetting(key: string, value: string) {
  db.query(
    `INSERT INTO contactmate_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

export function deleteSetting(key: string) {
  db.query('DELETE FROM contactmate_setting WHERE key = ?').run(key)
}

export function getSettingJson<T>(key: string): T | null {
  const raw = getSetting(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveSettingJson(key: string, value: unknown) {
  saveSetting(key, JSON.stringify(value))
}
