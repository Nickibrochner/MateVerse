import { json, request } from '../../api'

/**
 * Samme signatur som Tauris `invoke()`, men kalder MateVerse-backenden.
 * Kommandoerne har samme navne og argumenter som i Tauri-udgaven (se backend/src/mates/diskmate/commands.ts).
 */
export async function invoke<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { result } = await request<{ result: T }>(`/diskmate/rpc/${command}`, json('POST', args))
  return result
}

/** Lader brugeren hente data som en JSON-fil (erstatter Tauris gem-dialog). */
export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

/** Åbner en filvælger og returnerer den valgte fil (erstatter Tauris åbn-dialog). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept })
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** Fejlbesked uden "Error: "-præfiks (Tauri sendte fejl som rene strenge). */
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
