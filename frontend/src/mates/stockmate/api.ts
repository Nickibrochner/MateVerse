import { json, request } from '../../api'

export type TxType = 'Buy' | 'Sell'

export interface Holding {
  key: string
  stock: { id: number; ticker: string; name: string | null; currency: string }
  depot_type: string
  quantity: number
  cost_dkk: number
  avg_cost_dkk: number
  price: number | null
  price_source: 'live' | 'cache' | 'none'
  price_dkk: number | null
  value_dkk: number | null
  unrealized_dkk: number | null
  unrealized_pct: number | null
}

export interface Transaction {
  id: number
  user_id: number
  stock_id: number
  ticker: string
  stock_name?: string | null
  depot_type: string
  type: TxType
  quantity: number
  price_per_share: number
  currency: string
  fx_rate: number
  brokerage_fee: number
  transaction_date: string
  note: string | null
  total_dkk?: number
  realized_dkk?: number | null
  error?: string | null
}

export interface Totals {
  value_dkk: number
  cost_dkk: number
  unrealized_dkk: number
  missing_prices: number
}

export interface Portfolio {
  user: { id: number; username: string }
  holdings: Holding[]
  transactions: Transaction[]
  totals: Totals & { realized_dkk: number }
}

export interface OverviewRow extends Totals {
  user: { id: number; username: string }
  positions: number
}

export interface TxInput {
  user_id: number
  ticker: string
  depot_type: string
  type: TxType
  quantity: number
  price_per_share: number
  currency: string
  fx_rate?: number
  brokerage_fee?: number
  transaction_date: string
  note?: string | null
}

export interface Quote {
  ticker: string
  price: number | null
  currency: string | null
  name: string | null
  source: 'live' | 'cache' | 'none'
  fx_rate: number | null
}

export interface SearchResult {
  symbol: string
  name: string | null
  exchange: string | null
}

const base = '/stockmate'

export const stockmateApi = {
  meta: () => request<{ depot_types: string[]; default_brokerage_rate: number }>(`${base}/meta`),
  overview: () => request<OverviewRow[]>(`${base}/overview`),
  portfolio: (userId: number) => request<Portfolio>(`${base}/users/${userId}/portfolio`),
  stocks: () => request<{ id: number; ticker: string; name: string | null; currency: string }[]>(`${base}/stocks`),
  search: (q: string) => request<SearchResult[]>(`${base}/search?q=${encodeURIComponent(q)}`),
  quote: (ticker: string) => request<Quote>(`${base}/quote/${encodeURIComponent(ticker)}`),
  fx: (currency: string) => request<{ currency: string; rate_dkk: number }>(`${base}/fx/${encodeURIComponent(currency)}`),
  refresh: () => request<{ ok: boolean }>(`${base}/refresh`, { method: 'POST' }),
  getTransaction: (id: number) => request<Transaction>(`${base}/transactions/${id}`),
  createTransaction: (body: TxInput) => request<Transaction>(`${base}/transactions`, json('POST', body)),
  updateTransaction: (id: number, body: TxInput) => request<Transaction>(`${base}/transactions/${id}`, json('PUT', body)),
  deleteTransaction: (id: number) => request<{ deleted: number }>(`${base}/transactions/${id}`, { method: 'DELETE' }),
}
