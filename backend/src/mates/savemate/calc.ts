/** Savemates beregninger – rene funktioner. Datoer er 'YYYY-MM-DD'. */

const DAYS_PER_MONTH = 30.44

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Måneder fra `today` til `target` (0, hvis datoen er passeret). */
export const monthsLeft = (target: string, today: string) =>
  Math.max(0, (toDate(target) - toDate(today)) / 86_400_000 / DAYS_PER_MONTH)

export interface GoalLike {
  target_amount: number
  target_date: string
}

export type GoalStatus = 'reached' | 'on_track' | 'behind' | 'overdue'

export function goalStats(goal: GoalLike, saved: number, today: string, recentMonthly = 0) {
  const remaining = Math.max(0, goal.target_amount - saved)
  const months = monthsLeft(goal.target_date, today)
  const monthlyNeeded = remaining > 0 && months > 0 ? remaining / months : 0
  let status: GoalStatus
  if (remaining <= 0) status = 'reached'
  else if (months <= 0) status = 'overdue'
  else status = recentMonthly >= monthlyNeeded - 0.005 ? 'on_track' : 'behind'
  return {
    saved,
    remaining,
    progress: Math.min(1, saved / goal.target_amount),
    months_left: months,
    monthly_needed: monthlyNeeded,
    status,
  }
}

/**
 * Samlet månedligt behov: alt, der mangler på aktive mål, minus generelle engangsbeløb,
 * fordelt over tiden frem til den seneste måldato.
 */
export function overallMonthly(goals: { target_date: string; remaining: number }[], generalLumpSums: number, today: string) {
  const active = goals.filter(g => g.remaining > 0 && monthsLeft(g.target_date, today) > 0)
  if (!active.length) return 0
  const remaining = Math.max(0, active.reduce((s, g) => s + g.remaining, 0) - generalLumpSums)
  const months = Math.max(...active.map(g => monthsLeft(g.target_date, today)))
  return remaining / months
}

/** Gennemsnitlig månedlig indbetaling (ekskl. engangsbeløb) over de seneste `months` måneder. */
export function recentMonthly(contributions: { amount: number; contribution_date: string; is_lump_sum: boolean }[], today: string, months = 3) {
  const from = toDate(today) - months * DAYS_PER_MONTH * 86_400_000
  const sum = contributions
    .filter(c => !c.is_lump_sum && toDate(c.contribution_date) > from && toDate(c.contribution_date) <= toDate(today))
    .reduce((s, c) => s + c.amount, 0)
  return sum / months
}
