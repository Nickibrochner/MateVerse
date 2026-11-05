import type { Person } from './api'

/** Grå/blå/lyserød silhuet som pladsholder for personer uden billede. */
export function placeholderSvg(køn: string | null): string {
  const f = køn === 'mand' ? '%231d4ed8' : køn === 'kvinde' ? '%23db2777' : '%2378716c'
  return (
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
    `<circle cx='50' cy='34' r='22' fill='${f}' opacity='.4'/>` +
    `<path d='M10 96 Q15 63 50 63 Q85 63 90 96Z' fill='${f}' opacity='.4'/></svg>`
  )
}

/** Alder (eller alder ved død). Kun årstal giver "ca. N år". */
export function beregnAlder(p: Pick<Person, 'fødselsdato' | 'dødsdato'>): string | null {
  if (!p.fødselsdato) return null
  if (p.fødselsdato.length >= 7) {
    const f = new Date(p.fødselsdato)
    const s = new Date(p.dødsdato ?? new Date().toISOString().slice(0, 10))
    let age = s.getFullYear() - f.getFullYear()
    if (s.getMonth() < f.getMonth() || (s.getMonth() === f.getMonth() && s.getDate() < f.getDate())) age--
    return `${age} år`
  }
  const fÅr = parseInt(p.fødselsdato.slice(0, 4))
  const sÅr = p.dødsdato ? parseInt(p.dødsdato.slice(0, 4)) : new Date().getFullYear()
  return `ca. ${sÅr - fÅr} år`
}

/** Datoer kan være hele (1890-03-05), år-måned eller kun årstal. */
export function formatDato(dato: string): string {
  if (dato.length === 4) return dato
  if (dato.length === 7) {
    const [y, m] = dato.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('da-DK', { month: 'long', year: 'numeric' })
  }
  const d = new Date(dato)
  return isNaN(d.getTime()) ? dato : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const kønIkon = (køn: string | null) => (køn === 'mand' ? '♂' : køn === 'kvinde' ? '♀' : '⚧')

/** Læser en fil som data-URL (til billedupload). */
export const læsSomDataUrl = (fil: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(fil)
  })

/** Hent tekst som fil i browseren. */
export function downloadTekst(filnavn: string, indhold: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([indhold], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filnavn })
  a.click()
  URL.revokeObjectURL(url)
}

export const filnavn = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_')
