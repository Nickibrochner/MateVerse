import { Elysia, t } from 'elysia'
import { db } from '../../db'
import { HttpError, httpErrors } from '../../lib/http'
import { clearQuoteCache, getFxRate, getHistoricalPrices, getQuote, searchTickers } from './market'
import { defaultBrokerage, firstError, positionKey, replay, round, taxSummary, totalDkk, type TxRow } from './portfolio'
import {
  getCryptoHistoricalPrices, getSetting, importUpholdCsv, refreshCryptoPrices, saveSetting, syncCoinbase,
} from './crypto'

export const DEPOT_TYPES = ['Frie midler', 'Aktiesparekonto', 'Ratepension', 'Aldersopsparing', 'Børneopsparing'] as const

interface Stock {
  id: number
  ticker: string
  name: string | null
  currency: string
  last_price: number | null
  last_price_at: string | null
}

const userExists = (id: number) => !!db.query('SELECT 1 FROM user WHERE id = ?').get(id)
const txForUser = (userId: number) =>
  db.query('SELECT * FROM stockmate_transaction WHERE user_id = ?').all(userId) as TxRow[]

function ensureStock(ticker: string, currency: string, name?: string | null): Stock {
  ticker = ticker.trim().toUpperCase()
  db.query('INSERT OR IGNORE INTO stockmate_stock (ticker, name, currency) VALUES (?, ?, ?)').run(ticker, name ?? null, currency)
  return db.query('SELECT * FROM stockmate_stock WHERE ticker = ?').get(ticker) as Stock
}

/** Beholdninger med aktuel kurs og værdi i DKK. */
async function holdingsFor(userId: number) {
  const { positions } = replay(txForUser(userId))
  const stocks = new Map(
    (db.query('SELECT * FROM stockmate_stock').all() as Stock[]).map(s => [s.id, s]),
  )
  return Promise.all(
    positions.map(async p => {
      const stock = stocks.get(p.stock_id)!
      const quote = await getQuote(stock.ticker)
      const currency = quote.currency ?? stock.currency
      const fx = await getFxRate(currency)
      const value = quote.price != null ? p.quantity * quote.price * fx : null
      return {
        key: positionKey(p.stock_id, p.depot_type),
        stock: { id: stock.id, ticker: stock.ticker, name: quote.name ?? stock.name, currency },
        depot_type: p.depot_type,
        quantity: p.quantity,
        cost_dkk: round(p.cost_dkk),
        avg_cost_dkk: round(p.cost_dkk / p.quantity, 4),
        price: quote.price,
        price_source: quote.source,
        price_dkk: quote.price != null ? round(quote.price * fx, 4) : null,
        value_dkk: value != null ? round(value) : null,
        unrealized_dkk: value != null ? round(value - p.cost_dkk) : null,
        unrealized_pct: value != null && p.cost_dkk > 0 ? round(((value - p.cost_dkk) / p.cost_dkk) * 100) : null,
      }
    }),
  )
}

const sum = (xs: (number | null)[]) => round(xs.reduce<number>((a, b) => a + (b ?? 0), 0))

/** Omsætter en fejl fra et eksternt API (eller manglende nøgler) til en HttpError med en forståelig besked. */
async function withUpstreamError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new HttpError(502, (e as Error).message)
  }
}

/** Gemmer dagens porteføljeværdi, så Udvikling-grafen kan vise den over tid. Ét snapshot pr. bruger pr. dag. */
function saveSnapshot(userId: number, valueDkk: number, investedDkk: number) {
  db.query(
    `INSERT INTO stockmate_portfolio_snapshot (user_id, snapshot_date, total_value_dkk, total_invested_dkk)
     VALUES (?, date('now'), ?, ?)
     ON CONFLICT(user_id, snapshot_date) DO UPDATE SET total_value_dkk = excluded.total_value_dkk, total_invested_dkk = excluded.total_invested_dkk`,
  ).run(userId, valueDkk, investedDkk)
}

const txBody = t.Object({
  user_id: t.Integer(),
  ticker: t.String({ minLength: 1, maxLength: 20 }),
  depot_type: t.String({ minLength: 1 }),
  type: t.Union([t.Literal('Buy'), t.Literal('Sell'), t.Literal('Dividend')]),
  quantity: t.Number({ exclusiveMinimum: 0 }),
  price_per_share: t.Number({ minimum: 0 }),
  currency: t.String({ minLength: 3, maxLength: 3 }),
  fx_rate: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  brokerage_fee: t.Optional(t.Number({ minimum: 0 })),
  transaction_date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  note: t.Optional(t.Nullable(t.String())),
})

type TxBody = typeof txBody.static

/** Gemmer en transaktion (ny eller rettet) og afviser den, hvis den gør et salg ugyldigt. */
async function saveTransaction(body: TxBody, id?: number) {
  if (!userExists(body.user_id)) throw new HttpError(404, 'Brugeren findes ikke')
  const currency = body.currency.toUpperCase()
  const fx = body.fx_rate ?? (await getFxRate(currency))
  const fee = body.brokerage_fee ?? defaultBrokerage(body.quantity, body.price_per_share)

  return db.transaction(() => {
    const stock = ensureStock(body.ticker, currency)
    const params = [
      body.user_id, stock.id, body.depot_type, body.type, body.quantity, body.price_per_share,
      currency, fx, fee, body.transaction_date, body.note ?? null,
    ]
    let txId = id
    if (id == null) {
      txId = (db.query(
        `INSERT INTO stockmate_transaction
           (user_id, stock_id, depot_type, type, quantity, price_per_share, currency, fx_rate, brokerage_fee, transaction_date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).get(...params) as { id: number }).id
    } else {
      const res = db.query(
        `UPDATE stockmate_transaction SET user_id = ?, stock_id = ?, depot_type = ?, type = ?, quantity = ?,
           price_per_share = ?, currency = ?, fx_rate = ?, brokerage_fee = ?, transaction_date = ?, note = ?
         WHERE id = ?`,
      ).run(...params, id)
      if (res.changes === 0) throw new HttpError(404, 'Transaktionen findes ikke')
    }
    const error = firstError(txForUser(body.user_id))
    if (error) throw new HttpError(422, error) // ruller transaktionen tilbage
    return getTransaction(txId!)
  })()
}

function getTransaction(id: number) {
  return db.query(
    `SELECT t.*, s.ticker FROM stockmate_transaction t JOIN stockmate_stock s ON s.id = t.stock_id WHERE t.id = ?`,
  ).get(id) as (TxRow & { ticker: string; note: string | null }) | null
}

export const stockmate = new Elysia({ prefix: '/stockmate' })
  .use(httpErrors)
  .get('/meta', () => ({ depot_types: DEPOT_TYPES, default_brokerage_rate: 0.01 }))

  /** Hurtigt overblik pr. bruger – bruges både af hubben og Stockmates forside. */
  .get('/overview', async () => {
    const users = db.query('SELECT id, username FROM user ORDER BY id').all() as { id: number; username: string }[]
    return Promise.all(
      users.map(async u => {
        const holdings = await holdingsFor(u.id)
        return {
          user: u,
          positions: holdings.length,
          value_dkk: sum(holdings.map(h => h.value_dkk)),
          cost_dkk: sum(holdings.map(h => h.cost_dkk)),
          unrealized_dkk: sum(holdings.map(h => h.unrealized_dkk)),
          missing_prices: holdings.filter(h => h.price == null).length,
        }
      }),
    )
  })

  .get('/users/:id/portfolio', async ({ params }) => {
    const user = db.query('SELECT id, username FROM user WHERE id = ?').get(params.id)
    if (!user) throw new HttpError(404, 'Brugeren findes ikke')
    const rows = db.query(
      `SELECT t.*, s.ticker, s.name AS stock_name FROM stockmate_transaction t
       JOIN stockmate_stock s ON s.id = t.stock_id
       WHERE t.user_id = ? ORDER BY t.transaction_date DESC, t.id DESC`,
    ).all(params.id) as (TxRow & { ticker: string; stock_name: string | null; note: string | null })[]
    const { results } = replay(rows)
    const holdings = await holdingsFor(params.id)
    const transactions = rows.map(r => ({
      ...r,
      total_dkk: totalDkk(r),
      realized_dkk: results.get(r.id)?.realized_dkk != null ? round(results.get(r.id)!.realized_dkk!) : null,
      error: results.get(r.id)?.error ?? null,
    }))
    const totals = {
      value_dkk: sum(holdings.map(h => h.value_dkk)),
      cost_dkk: sum(holdings.map(h => h.cost_dkk)),
      unrealized_dkk: sum(holdings.map(h => h.unrealized_dkk)),
      realized_dkk: sum(transactions.map(t => t.realized_dkk)),
      missing_prices: holdings.filter(h => h.price == null).length,
    }
    if (holdings.length) saveSnapshot(params.id, totals.value_dkk, totals.cost_dkk)
    return { user, holdings, transactions, totals }
  }, { params: t.Object({ id: t.Numeric() }) })

  /** Skatteopgørelse pr. år og depot – realiseret gevinst/tab fra salg, udbytte for sig. */
  .get('/users/:id/tax-summary', ({ params }) => taxSummary(txForUser(params.id)), { params: t.Object({ id: t.Numeric() }) })

  /** Porteføljeværdi dag for dag – til Udvikling-grafen. */
  .get('/users/:id/snapshots', ({ params, query }) => {
    const days = query.days ? Number(query.days) : 90
    return db.query(
      `SELECT snapshot_date, total_value_dkk, total_invested_dkk FROM stockmate_portfolio_snapshot
       WHERE user_id = ?1 AND snapshot_date >= date('now', '-' || ?2 || ' days') ORDER BY snapshot_date ASC`,
    ).all(params.id, days)
  }, { params: t.Object({ id: t.Numeric() }), query: t.Object({ days: t.Optional(t.Numeric()) }) })

  /** Historiske dagskurser for én aktie – til graf ved klik på en beholdning. */
  .get('/history/:ticker', ({ params, query }) => getHistoricalPrices(params.ticker, query.period ?? '3mo'), {
    query: t.Object({ period: t.Optional(t.String()) }),
  })

  .get('/stocks', () => db.query('SELECT * FROM stockmate_stock ORDER BY ticker').all() as Stock[])
  .get('/search', ({ query }) => searchTickers(query.q ?? ''), { query: t.Object({ q: t.Optional(t.String()) }) })
  .get('/quote/:ticker', async ({ params }) => {
    const quote = await getQuote(params.ticker)
    return { ...quote, fx_rate: quote.currency ? await getFxRate(quote.currency) : null }
  })
  .get('/fx/:currency', async ({ params }) => ({ currency: params.currency.toUpperCase(), rate_dkk: await getFxRate(params.currency) }))
  .post('/refresh', () => {
    clearQuoteCache()
    return { ok: true }
  })

  .post('/transactions', ({ body }) => saveTransaction(body), { body: txBody })
  .get('/transactions/:id', ({ params }) => {
    const tx = getTransaction(params.id)
    if (!tx) throw new HttpError(404, 'Transaktionen findes ikke')
    return tx
  }, { params: t.Object({ id: t.Numeric() }) })
  .put('/transactions/:id', ({ params, body }) => saveTransaction(body, params.id), {
    params: t.Object({ id: t.Numeric() }),
    body: txBody,
  })
  .delete('/transactions/:id', ({ params }) => {
    const tx = getTransaction(params.id)
    if (!tx) throw new HttpError(404, 'Transaktionen findes ikke')
    db.transaction(() => {
      db.query('DELETE FROM stockmate_transaction WHERE id = ?').run(params.id)
      const error = firstError(txForUser(tx.user_id))
      if (error) throw new HttpError(422, `Kan ikke slettes: ${error.toLowerCase()}`)
    })()
    return { deleted: params.id }
  }, { params: t.Object({ id: t.Numeric() }) })

  // ── Krypto (fælles for husstanden, ikke pr. bruger) ──
  .get('/crypto/holdings', () =>
    db.query(
      `SELECT * FROM stockmate_crypto_holding WHERE amount > 0.000000001
       ORDER BY (amount * COALESCE(last_known_price_usd, 0)) DESC`,
    ).all())

  /** Kun om nøglerne er sat, ikke selve værdierne – Coinbase-nøglen vises ikke igen, når den først er gemt. */
  .get('/crypto/settings', () => ({
    coinbase_key_name: getSetting('coinbase_key_name'),
    has_coinbase_private_key: !!getSetting('coinbase_private_key'),
    has_coingecko_api_key: !!getSetting('coingecko_api_key'),
  }))
  .post('/crypto/settings', ({ body }) => {
    for (const [key, value] of Object.entries(body)) if (value) saveSetting(key, value)
    return { ok: true }
  }, {
    body: t.Object({
      coinbase_key_name: t.Optional(t.String()),
      coinbase_private_key: t.Optional(t.String()),
      coingecko_api_key: t.Optional(t.String()),
    }),
  })

  .post('/crypto/sync-coinbase', () => withUpstreamError(() => syncCoinbase()).then(synced => ({ synced })))
  .post('/crypto/refresh-prices', () => withUpstreamError(() => refreshCryptoPrices()).then(updated => ({ updated })))
  .post('/crypto/sync-all', async () => {
    const [coinbase, prices] = await Promise.allSettled([syncCoinbase(), refreshCryptoPrices()])
    return {
      coinbase: coinbase.status === 'fulfilled' ? { synced: coinbase.value } : { error: coinbase.reason?.message ?? String(coinbase.reason) },
      prices: prices.status === 'fulfilled' ? { updated: prices.value } : { error: prices.reason?.message ?? String(prices.reason) },
    }
  })
  .post('/crypto/import-uphold', ({ body }) => {
    try {
      return { imported: importUpholdCsv(body.csv_content) }
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, {
    body: t.Object({ csv_content: t.String() }),
  })
  .get('/crypto/history/:coinId', ({ params, query }) => getCryptoHistoricalPrices(params.coinId, query.days ?? '90'), {
    query: t.Object({ days: t.Optional(t.String()) }),
  })
