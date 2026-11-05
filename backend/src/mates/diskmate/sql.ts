import { db } from '../../db'

/**
 * DiskMates SQL er overtaget fra Tauri-udgaven med de oprindelige tabelnavne.
 * q() tilføjer `diskmate_`-præfikset, så forespørgslerne kan stå næsten ordret.
 */
const TABLES = /\b(courses|layouts|course_holes|holes|rounds|round_scores|discs|round_discs)\b/g
const cache = new Map<string, string>()

export function q(sql: string) {
  let out = cache.get(sql)
  if (!out) cache.set(sql, (out = sql.replace(TABLES, 'diskmate_$1')))
  return db.query(out)
}

export const run = (sql: string, ...params: unknown[]) => q(sql).run(...(params as never[]))
export const get = <T>(sql: string, ...params: unknown[]) => q(sql).get(...(params as never[])) as T | null
export const all = <T>(sql: string, ...params: unknown[]) => q(sql).all(...(params as never[])) as T[]
