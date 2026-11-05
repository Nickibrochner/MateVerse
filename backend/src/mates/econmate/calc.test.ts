import { describe, expect, test } from 'bun:test'
import { balances, byCategory, monthly, paidBy, suggestTransfers } from './calc'

describe('econmate', () => {
  test('månedligt beløb ud fra frekvens', () => {
    expect(monthly({ amount: 1200, paid_by: 1, payment_frequency: 'Årlig' })).toBe(100)
    expect(monthly({ amount: 300, paid_by: 1, payment_frequency: 'Kvartalsvis' })).toBe(100)
    expect(monthly({ amount: 50, paid_by: 1, payment_frequency: 'Engangs' })).toBe(50)
  })

  test('fælles udgifter fordeles ligeligt', () => {
    const paid = paidBy([1, 2], [{ amount: 100, paid_by: null }, { amount: 50, paid_by: 1 }])
    expect(paid.get(1)).toBe(100)
    expect(paid.get(2)).toBe(50)
  })

  test('saldo og udligning', () => {
    const exp = [{ amount: 300, paid_by: 1 }, { amount: 100, paid_by: 2 }]
    let bal = balances([1, 2], exp, [])
    expect(bal.get(1)).toBe(100)
    expect(bal.get(2)).toBe(-100)
    bal = balances([1, 2], exp, [{ payer_id: 2, receiver_id: 1, amount: 100 }])
    expect(bal.get(1)).toBe(0)
    expect(bal.get(2)).toBe(0)
  })

  test('forslag til overførsler', () => {
    const t = suggestTransfers(new Map([[1, 200], [2, -50], [3, -150]]))
    expect(t).toEqual([{ from: 3, to: 1, amount: 150 }, { from: 2, to: 1, amount: 50 }])
  })

  test('kategorier', () => {
    const c = byCategory([{ amount: 1200, paid_by: 1, category: 'Bolig', payment_frequency: 'Årlig' }, { amount: 5, paid_by: 1 }])
    expect(c.get('Bolig')).toBe(100)
    expect(c.get('Diverse')).toBe(5)
  })
})
