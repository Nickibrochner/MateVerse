import { db } from '../../db'

/**
 * Markedsdata fra Yahoo Finance (samme endpoints som Tauri-udgaven af Stockmate).
 * Kurser caches i hukommelsen et par minutter, og sidst kendte kurs gemmes i databasen,
 * så appen stadig virker, hvis Yahoo ikke svarer.
 */

const YAHOO = 'https://query1.finance.yahoo.com'
const QUOTE_TTL = 5 * 60_000
const FX_TTL = 60 * 60_000
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

/** Bruges kun, hvis der hverken er net eller en gemt kurs. */
const FALLBACK_FX: Record<string, number> = { DKK: 1, USD: 6.9, EUR: 7.46, SEK: 0.65, NOK: 0.64, GBP: 8.7 }

export interface Quote {
  ticker: string
  price: number | null
  currency: string | null
  name: string | null
  /** 'live' = hentet nu, 'cache' = fra databasen. */
  source: 'live' | 'cache' | 'none'
}

const quoteCache = new Map<string, { at: number; quote: Quote }>()

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Yahoo svarede ${res.status}`)
  return res.json()
}

async function fetchChartMeta(symbol: string) {
  const json = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(`Ingen kurs for ${symbol}`)
  return meta as { regularMarketPrice: number; currency?: string; longName?: string; shortName?: string }
}

export async function getQuote(ticker: string, force = false): Promise<Quote> {
  ticker = ticker.toUpperCase()
  const hit = quoteCache.get(ticker)
  if (!force && hit && Date.now() - hit.at < QUOTE_TTL) return hit.quote

  try {
    const meta = await fetchChartMeta(ticker)
    const quote: Quote = {
      ticker,
      price: meta.regularMarketPrice,
      currency: meta.currency?.toUpperCase() ?? null,
      name: meta.longName ?? meta.shortName ?? null,
      source: 'live',
    }
    quoteCache.set(ticker, { at: Date.now(), quote })
    db.query(
      `UPDATE stockmate_stock SET last_price = ?, last_price_at = datetime('now'),
         currency = COALESCE(?, currency), name = COALESCE(name, ?) WHERE ticker = ?`,
    ).run(quote.price, quote.currency, quote.name, ticker)
    return quote
  } catch (e) {
    console.warn(`Kurs for ${ticker} kunne ikke hentes:`, (e as Error).message)
    const row = db.query('SELECT last_price, currency, name FROM stockmate_stock WHERE ticker = ?').get(ticker) as
      | { last_price: number | null; currency: string; name: string | null }
      | null
    const quote: Quote = {
      ticker,
      price: row?.last_price ?? null,
      currency: row?.currency ?? null,
      name: row?.name ?? null,
      source: row?.last_price != null ? 'cache' : 'none',
    }
    // Kort cache på fejl, så en død forbindelse ikke gør hver side langsom
    quoteCache.set(ticker, { at: Date.now() - QUOTE_TTL + 30_000, quote })
    return quote
  }
}

/** Kurs i DKK for én enhed af valutaen. */
export async function getFxRate(currency: string, force = false): Promise<number> {
  currency = currency.toUpperCase()
  if (currency === 'DKK') return 1
  const row = db.query('SELECT rate_dkk, updated_at FROM stockmate_fx WHERE currency = ?').get(currency) as
    | { rate_dkk: number; updated_at: string }
    | null
  if (!force && row && Date.now() - Date.parse(row.updated_at) < FX_TTL) return row.rate_dkk

  try {
    const meta = await fetchChartMeta(`${currency}DKK=X`)
    const rate = meta.regularMarketPrice
    db.query(
      `INSERT INTO stockmate_fx (currency, rate_dkk, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(currency) DO UPDATE SET rate_dkk = excluded.rate_dkk, updated_at = excluded.updated_at`,
    ).run(currency, rate, new Date().toISOString())
    return rate
  } catch (e) {
    console.warn(`Valutakurs for ${currency} kunne ikke hentes:`, (e as Error).message)
    return row?.rate_dkk ?? FALLBACK_FX[currency] ?? 1
  }
}

export interface SearchResult {
  symbol: string
  name: string | null
  exchange: string | null
}

export async function searchTickers(q: string): Promise<SearchResult[]> {
  if (!q.trim()) return []
  try {
    const json = await fetchJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`)
    return (json?.quotes ?? [])
      .filter((x: any) => x.symbol)
      .map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? null, exchange: x.exchDisp ?? x.exchange ?? null }))
  } catch {
    return []
  }
}

export const clearQuoteCache = () => quoteCache.clear()

export interface HistoricalPrice {
  timestamp: number
  close: number
}

const PERIODS = new Set(['1mo', '3mo', '6mo', '1y', '5y'])

/** Historiske dagskurser til en graf. Ukendt periode falder tilbage til 3 måneder. */
export async function getHistoricalPrices(ticker: string, period: string): Promise<HistoricalPrice[]> {
  const range = PERIODS.has(period) ? period : '3mo'
  try {
    const json = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`)
    const result = json?.chart?.result?.[0]
    const timestamps: number[] = result?.timestamp ?? []
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
    const prices: HistoricalPrice[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (typeof close === 'number') prices.push({ timestamp: timestamps[i], close })
    }
    return prices
  } catch (e) {
    console.warn(`Historiske kurser for ${ticker} kunne ikke hentes:`, (e as Error).message)
    return []
  }
}
