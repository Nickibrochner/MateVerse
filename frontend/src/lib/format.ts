const dkk = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 4 })

/** 1.234,56 DKK – samme format som den gamle Flask-udgave. */
export const money = (value: number | null | undefined, currency = 'DKK') =>
  value == null ? '–' : `${dkk.format(value)} ${currency}`

/** Gevinst/tab med fortegn. */
export const signed = (value: number | null | undefined, currency = 'DKK') =>
  value == null ? '–' : `${value > 0 ? '+' : ''}${money(value, currency)}`

export const percent = (value: number | null | undefined) =>
  value == null ? '' : `${value > 0 ? '+' : ''}${dkk.format(value)} %`

export const quantity = (value: number) => qty.format(value)

/** 2024-03-01 → 01-03-2024 */
export const date = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}-${m}-${y}` : iso
}

export const today = () => new Date().toISOString().slice(0, 10)

export const gainClass = (value: number | null | undefined) =>
  value == null || Math.abs(value) < 0.005 ? '' : value > 0 ? 'text-gain' : 'text-loss'
