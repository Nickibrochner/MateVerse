/**
 * Econmates beregninger – rene funktioner.
 * En udgift med paid_by = null er "Fælles" og fordeles ligeligt mellem deltagerne.
 */

export const FREQUENCIES = ['Engangs', 'Månedlig', 'Hver anden måned', 'Kvartalsvis', 'Halvårlig', 'Årlig'] as const

const MONTHS: Record<string, number> = {
  'Månedlig': 1, 'Hver anden måned': 2, 'Kvartalsvis': 3, 'Halvårlig': 6, 'Årlig': 12,
}

export interface ExpenseLike {
  amount: number
  paid_by: number | null
  category?: string | null
  payment_frequency?: string | null
}

export interface SettlementLike {
  payer_id: number
  receiver_id: number
  amount: number
}

/** Beløb omregnet til pr. måned. Engangsbeløb og ukendt frekvens tælles fuldt. */
export const monthly = (e: ExpenseLike) => e.amount / (MONTHS[e.payment_frequency ?? ''] ?? 1)

/** Hvor meget hver deltager har lagt ud – fælles udgifter fordeles ligeligt. */
export function paidBy(members: number[], expenses: ExpenseLike[], value: (e: ExpenseLike) => number = e => e.amount) {
  const out = new Map(members.map(m => [m, 0]))
  for (const e of expenses) {
    const v = value(e)
    if (e.paid_by == null) {
      if (members.length) for (const m of members) out.set(m, out.get(m)! + v / members.length)
    } else if (out.has(e.paid_by)) {
      out.set(e.paid_by, out.get(e.paid_by)! + v)
    }
  }
  return out
}

/**
 * Saldo pr. deltager i et projekt: udlæg − ligelig andel, justeret for udligninger.
 * Positiv = skal have penge, negativ = skylder.
 */
export function balances(members: number[], expenses: ExpenseLike[], settlements: SettlementLike[]) {
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const share = members.length ? total / members.length : 0
  const paid = paidBy(members, expenses)
  const out = new Map(members.map(m => [m, paid.get(m)! - share]))
  for (const s of settlements) {
    if (out.has(s.payer_id)) out.set(s.payer_id, out.get(s.payer_id)! + s.amount)
    if (out.has(s.receiver_id)) out.set(s.receiver_id, out.get(s.receiver_id)! - s.amount)
  }
  return out
}

/** Forslag til så få overførsler som muligt, der bringer alle i balance. */
export function suggestTransfers(bal: Map<number, number>) {
  const debtors = [...bal].filter(([, b]) => b < -0.005).map(([id, b]) => ({ id, left: -b })).sort((a, b) => b.left - a.left)
  const creditors = [...bal].filter(([, b]) => b > 0.005).map(([id, b]) => ({ id, left: b })).sort((a, b) => b.left - a.left)
  const transfers: { from: number; to: number; amount: number }[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left)
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amount * 100) / 100 })
    debtors[i].left -= amount
    creditors[j].left -= amount
    if (debtors[i].left < 0.005) i++
    if (creditors[j].left < 0.005) j++
  }
  return transfers
}

/** Månedlige beløb pr. kategori (budgetter). */
export function byCategory(expenses: ExpenseLike[]) {
  const out = new Map<string, number>()
  for (const e of expenses) {
    const c = e.category || 'Diverse'
    out.set(c, (out.get(c) ?? 0) + monthly(e))
  }
  return out
}
