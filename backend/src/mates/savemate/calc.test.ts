import { describe, expect, test } from 'bun:test'
import { goalStats, monthsLeft, overallMonthly, recentMonthly } from './calc'

const TODAY = '2026-01-01'

describe('savemate', () => {
  test('måneder tilbage', () => {
    expect(monthsLeft('2026-01-01', TODAY)).toBe(0)
    expect(monthsLeft('2025-06-01', TODAY)).toBe(0)
    expect(monthsLeft('2027-01-01', TODAY)).toBeCloseTo(365 / 30.44)
  })

  test('månedligt behov og status', () => {
    const goal = { target_amount: 12_000, target_date: '2027-01-01' }
    const s = goalStats(goal, 2_000, TODAY)
    expect(s.remaining).toBe(10_000)
    expect(s.monthly_needed).toBeCloseTo(10_000 / (365 / 30.44))
    expect(s.status).toBe('behind')
    expect(goalStats(goal, 2_000, TODAY, 1_000).status).toBe('on_track')
    expect(goalStats(goal, 12_500, TODAY).status).toBe('reached')
    expect(goalStats({ ...goal, target_date: '2025-12-01' }, 0, TODAY).status).toBe('overdue')
  })

  test('samlet behov trækker generelle engangsbeløb fra', () => {
    const goals = [
      { target_date: '2027-01-01', remaining: 6_000 },
      { target_date: '2026-07-01', remaining: 6_000 },
      { target_date: '2025-01-01', remaining: 99_999 }, // passeret – tæller ikke
    ]
    const months = 365 / 30.44
    expect(overallMonthly(goals, 0, TODAY)).toBeCloseTo(12_000 / months)
    expect(overallMonthly(goals, 2_000, TODAY)).toBeCloseTo(10_000 / months)
    expect(overallMonthly(goals, 50_000, TODAY)).toBe(0)
  })

  test('gennemsnitlig månedlig opsparing', () => {
    const c = [
      { amount: 900, contribution_date: '2025-12-01', is_lump_sum: false },
      { amount: 5000, contribution_date: '2025-12-15', is_lump_sum: true },
      { amount: 900, contribution_date: '2024-01-01', is_lump_sum: false },
    ]
    expect(recentMonthly(c, TODAY)).toBe(300)
  })
})
