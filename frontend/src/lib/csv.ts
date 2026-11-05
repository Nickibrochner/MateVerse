/** Hent en CSV-fil i browseren – semikolon og komma som decimaltegn, så Excel på dansk åbner den korrekt. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const cell = (v: string | number) =>
    `"${(typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v).replace(/"/g, '""')}"`
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
