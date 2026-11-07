import { describe, expect, test } from 'bun:test'
import { firstError, replay, taxSummary, totalDkk, type TxRow } from './portfolio'

let nextId = 1
const tx = (p: Partial<TxRow>): TxRow => ({
  id: nextId++, user_id: 1, stock_id: 1, depot_type: 'Frie midler', type: 'Buy', quantity: 10,
  price_per_share: 100, currency: 'DKK', fx_rate: 1, brokerage_fee: 0, transaction_date: '2024-01-01', ...p,
})

describe('replay', () => {
  test('gennemsnitspris inkl. kurtage', () => {
    const { positions } = replay([
      tx({ quantity: 10, price_per_share: 100, brokerage_fee: 10 }),
      tx({ quantity: 10, price_per_share: 200, brokerage_fee: 10, transaction_date: '2024-02-01' }),
    ])
    expect(positions).toHaveLength(1)
    expect(positions[0].quantity).toBe(20)
    expect(positions[0].cost_dkk).toBe(3020)
  })

  test('realiseret gevinst ved salg og resterende kostpris', () => {
    const sell = tx({ type: 'Sell', quantity: 5, price_per_share: 150, brokerage_fee: 5, transaction_date: '2024-03-01' })
    const { positions, results } = replay([tx({ quantity: 10, price_per_share: 100 }), sell])
    expect(results.get(sell.id)!.realized_dkk).toBe(5 * 150 - 5 - 500)
    expect(positions[0].quantity).toBe(5)
    expect(positions[0].cost_dkk).toBe(500)
  })

  test('valutakurs fra transaktionen bruges', () => {
    const { positions } = replay([tx({ currency: 'USD', fx_rate: 7, price_per_share: 10, quantity: 2, brokerage_fee: 1 })])
    expect(positions[0].cost_dkk).toBe((20 + 1) * 7)
  })

  test('depoter holdes adskilt, og solgte positioner forsvinder', () => {
    const { positions } = replay([
      tx({ depot_type: 'A' }),
      tx({ depot_type: 'B' }),
      tx({ depot_type: 'A', type: 'Sell', transaction_date: '2024-05-01' }),
    ])
    expect(positions.map(p => p.depot_type)).toEqual(['B'])
  })

  test('salg før køb eller over beholdning er en fejl', () => {
    expect(firstError([tx({ type: 'Sell', transaction_date: '2023-12-01' }), tx({})])).toContain('overstiger')
    expect(firstError([tx({}), tx({ type: 'Sell', quantity: 11, transaction_date: '2024-02-01' })])).toContain('overstiger')
    expect(firstError([tx({}), tx({ type: 'Sell', quantity: 10, transaction_date: '2024-02-01' })])).toBeNull()
  })

  test('udbytte rører aldrig beholdningen', () => {
    const buy = tx({ quantity: 10, price_per_share: 100 })
    const dividend = tx({ type: 'Dividend', quantity: 1, price_per_share: 50, transaction_date: '2024-02-01' })
    const { positions, results } = replay([buy, dividend])
    expect(positions[0].quantity).toBe(10)
    expect(positions[0].cost_dkk).toBe(1000)
    expect(results.get(dividend.id)).toEqual({ realized_dkk: null, error: null })
    expect(firstError([buy, dividend])).toBeNull()
  })
})

describe('totalDkk', () => {
  test('kurtage lægges til ved køb, trækkes fra ved salg og udbytte', () => {
    expect(totalDkk(tx({ type: 'Buy', quantity: 10, price_per_share: 100, brokerage_fee: 10 }))).toBe(1010)
    expect(totalDkk(tx({ type: 'Sell', quantity: 10, price_per_share: 100, brokerage_fee: 10 }))).toBe(990)
    expect(totalDkk(tx({ type: 'Dividend', quantity: 1, price_per_share: 50, brokerage_fee: 0 }))).toBe(50)
  })
})

describe('taxSummary', () => {
  test('grupperer realiseret gevinst/tab og udbytte pr. år og depot', () => {
    const rows = taxSummary([
      tx({ quantity: 10, price_per_share: 100, transaction_date: '2024-01-01' }),
      tx({ type: 'Sell', quantity: 10, price_per_share: 150, transaction_date: '2024-06-01' }), // realiseret: 500
      tx({ type: 'Dividend', quantity: 1, price_per_share: 75, transaction_date: '2024-07-01' }),
      tx({ type: 'Dividend', quantity: 1, price_per_share: 25, depot_type: 'Pension', transaction_date: '2025-01-01' }),
    ])
    expect(rows).toEqual([
      { year: '2025', depot_type: 'Pension', realized_gain_loss: 0, dividend_income: 25 },
      { year: '2024', depot_type: 'Frie midler', realized_gain_loss: 500, dividend_income: 75 },
    ])
  })
})
