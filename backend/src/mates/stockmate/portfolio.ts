/**
 * Stockmates regnemotor: rene funktioner uden database eller netværk.
 * Beholdninger gemmes ikke – de udledes altid af transaktionerne (gennemsnitsmetoden).
 * Alle beløb i DKK omregnes med transaktionens egen kurs (`fx_rate`), så historikken ikke
 * flytter sig, når valutakursen ændrer sig.
 */

export type TxType = 'Buy' | 'Sell'

export interface TxRow {
  id: number
  user_id: number
  stock_id: number
  depot_type: string
  type: TxType
  quantity: number
  price_per_share: number
  currency: string
  fx_rate: number
  brokerage_fee: number
  transaction_date: string
}

export interface Position {
  stock_id: number
  depot_type: string
  quantity: number
  /** Samlet kostpris i DKK inkl. kurtage ved køb. */
  cost_dkk: number
}

export interface TxResult {
  /** Realiseret gevinst/tab i DKK – kun for salg. */
  realized_dkk: number | null
  /** Sat, hvis et salg overstiger beholdningen på datoen. */
  error: string | null
}

const EPS = 1e-9

const byDate = (a: TxRow, b: TxRow) =>
  a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : a.id - b.id

export const positionKey = (stockId: number, depot: string) => `${stockId}|${depot}`

/** Gennemløber transaktionerne kronologisk og returnerer beholdninger og resultat pr. transaktion. */
export function replay(transactions: TxRow[]) {
  const positions = new Map<string, Position>()
  const results = new Map<number, TxResult>()

  for (const tx of [...transactions].sort(byDate)) {
    const key = positionKey(tx.stock_id, tx.depot_type)
    const pos = positions.get(key) ?? { stock_id: tx.stock_id, depot_type: tx.depot_type, quantity: 0, cost_dkk: 0 }
    const gross = tx.quantity * tx.price_per_share * tx.fx_rate
    const fee = tx.brokerage_fee * tx.fx_rate

    if (tx.type === 'Buy') {
      pos.quantity += tx.quantity
      pos.cost_dkk += gross + fee
      results.set(tx.id, { realized_dkk: null, error: null })
    } else {
      if (tx.quantity > pos.quantity + EPS) {
        results.set(tx.id, { realized_dkk: null, error: `Salget overstiger beholdningen (${round(pos.quantity)} stk.)` })
        positions.set(key, pos)
        continue
      }
      const avg = pos.quantity > 0 ? pos.cost_dkk / pos.quantity : 0
      const costOfSold = avg * tx.quantity
      results.set(tx.id, { realized_dkk: gross - fee - costOfSold, error: null })
      pos.quantity -= tx.quantity
      pos.cost_dkk -= costOfSold
      if (pos.quantity <= EPS) {
        pos.quantity = 0
        pos.cost_dkk = 0
      }
    }
    positions.set(key, pos)
  }

  return { positions: [...positions.values()].filter(p => p.quantity > EPS), results }
}

/** Første fejl i en række transaktioner (bruges til at afvise ugyldige ændringer). */
export function firstError(transactions: TxRow[]): string | null {
  for (const r of replay(transactions).results.values()) if (r.error) return r.error
  return null
}

export const defaultBrokerage = (quantity: number, price: number, rate = 0.01) => round(quantity * price * rate)

export const round = (n: number, digits = 2) => {
  const f = 10 ** digits
  return Math.round((n + Number.EPSILON) * f) / f
}
