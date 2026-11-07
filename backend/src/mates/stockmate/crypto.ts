import { createPrivateKey, randomBytes, sign as cryptoSign } from 'node:crypto'
import { db } from '../../db'
import { parseCsv } from './csv'

/**
 * Stockmates krypto-sporing: Coinbase-synk (ES256-signeret JWT, samme CDP-auth som Tauri-udgaven),
 * CoinGecko-priser og Uphold CSV-import. Beholdningen er fælles for husstanden, ikke pr. bruger.
 *
 * Nøglerne (Coinbase Key Name/Private Key) gemmes ukrypteret i `stockmate_setting` efter eksplicit
 * aftale – Tauri-udgavens Windows-DPAPI-kryptering findes ikke i en Docker/Linux-backend.
 */

// ── Indstillinger ──
export function getSetting(key: string): string | null {
  const row = db.query('SELECT value FROM stockmate_setting WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function saveSetting(key: string, value: string) {
  db.query(
    `INSERT INTO stockmate_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

// ── Mønt-mapping (samme liste som Tauri-udgaven) ──
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin',
  DOT: 'polkadot', AVAX: 'avalanche-2', LINK: 'chainlink', LTC: 'litecoin', UNI: 'uniswap',
  MATIC: 'matic-network', POL: 'matic-network', ATOM: 'cosmos', XLM: 'stellar', ALGO: 'algorand',
  XTZ: 'tezos', AAVE: 'aave', BAT: 'basic-attention-token', ZRX: '0x', SHIB: 'shiba-inu',
  USDC: 'usd-coin', USDT: 'tether', DAI: 'dai', BCH: 'bitcoin-cash', ETC: 'ethereum-classic',
  ZEC: 'zcash', XMR: 'monero', FIL: 'filecoin', GRT: 'the-graph', MKR: 'maker', NEAR: 'near',
  FTM: 'fantom', VET: 'vechain', HBAR: 'hedera-hashgraph', ICP: 'internet-computer', APT: 'aptos',
  OP: 'optimism', ARB: 'arbitrum', SUI: 'sui', TRX: 'tron', TON: 'the-open-network', PEPE: 'pepe',
}

const DISPLAY_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin',
  DOT: 'Polkadot', AVAX: 'Avalanche', LINK: 'Chainlink', LTC: 'Litecoin', UNI: 'Uniswap',
  MATIC: 'Polygon', POL: 'Polygon', ATOM: 'Cosmos', XLM: 'Stellar', USDC: 'USD Coin', USDT: 'Tether',
  DAI: 'Dai', BCH: 'Bitcoin Cash', ETC: 'Ethereum Classic', SHIB: 'Shiba Inu', NEAR: 'NEAR Protocol',
  TRX: 'TRON', TON: 'Toncoin',
}

const STABLE_OR_FIAT = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP', 'EUR', 'GBP', 'USD', 'DKK', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK',
])

export const symbolToCoinGeckoId = (symbol: string) => COINGECKO_IDS[symbol.toUpperCase()] ?? symbol.toLowerCase()
export const coinDisplayName = (symbol: string) => DISPLAY_NAMES[symbol.toUpperCase()] ?? symbol
export const isStablecoinOrFiat = (symbol: string) => STABLE_OR_FIAT.has(symbol.toUpperCase())

const base64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** Fjerner spuriøse citationstegn og whitespace, som nemt sniger sig ind når en PEM-nøgle klistres ind i et tekstfelt. */
const cleanSetting = (v: string) => v.trim().replace(/^"|"$/g, '')

function createCoinbaseJwt(keyName: string, privateKeyPem: string, method: string, path: string): string {
  const now = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')
  const pemClean = privateKeyPem.replace(/\\n/g, '\n')
  const pathOnly = path.split('?')[0]
  const uri = `${method} api.coinbase.com${pathOnly}`

  const headerB64 = base64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyName, nonce, typ: 'JWT' })))
  const claimsB64 = base64url(Buffer.from(JSON.stringify({ iss: 'cdp', nbf: now, exp: now + 120, sub: keyName, uri })))
  const signingInput = `${headerB64}.${claimsB64}`

  const key = createPrivateKey(pemClean)
  const signature = cryptoSign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${base64url(signature)}`
}

interface CoinbaseAccount {
  currency: string
  available_balance: { value: string; currency: string }
  type?: string
}

/** Henter kontiene fra Coinbase og opdaterer beholdningen. Kræver coinbase_key_name + coinbase_private_key i indstillingerne. */
export async function syncCoinbase(): Promise<number> {
  const keyNameRaw = getSetting('coinbase_key_name')
  const privateKeyRaw = getSetting('coinbase_private_key')
  if (!keyNameRaw) throw new Error('Coinbase Key Name er ikke sat')
  if (!privateKeyRaw) throw new Error('Coinbase Private Key er ikke sat')
  const keyName = cleanSetting(keyNameRaw)
  const privateKeyPem = cleanSetting(privateKeyRaw)

  const path = '/api/v3/brokerage/accounts?limit=250'
  const jwt = createCoinbaseJwt(keyName, privateKeyPem, 'GET', path)

  const res = await fetch(`https://api.coinbase.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Coinbase API fejl ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { accounts: CoinbaseAccount[] }

  let synced = 0
  for (const account of data.accounts ?? []) {
    if (account.type === 'ACCOUNT_TYPE_FIAT') continue
    const symbol = account.currency.toUpperCase()
    const amount = Number(account.available_balance.value) || 0
    const coinId = symbolToCoinGeckoId(symbol)

    if (amount <= 0 || isStablecoinOrFiat(symbol)) {
      db.query(`DELETE FROM stockmate_crypto_holding WHERE coin_id = ? AND platform = 'coinbase'`).run(coinId)
      continue
    }
    db.query(
      `INSERT INTO stockmate_crypto_holding (coin_id, symbol, name, amount, platform)
       VALUES (?, ?, ?, ?, 'coinbase')
       ON CONFLICT(coin_id, platform) DO UPDATE SET amount = excluded.amount, name = excluded.name, updated_at = datetime('now')`,
    ).run(coinId, symbol, coinDisplayName(symbol), amount)
    synced++
  }
  return synced
}

/** Opdaterer USD/DKK-priser for alle møntarter, der reelt er i beholdning. */
export async function refreshCryptoPrices(): Promise<number> {
  const coinIds = (
    db.query(`SELECT DISTINCT coin_id FROM stockmate_crypto_holding WHERE amount > 0`).all() as { coin_id: string }[]
  ).map(r => r.coin_id)
  if (!coinIds.length) return 0

  const cgKey = getSetting('coingecko_api_key')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd,dkk`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (cgKey) headers['x-cg-demo-api-key'] = cgKey

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`CoinGecko API fejl: ${res.status}`)
  const prices = (await res.json()) as Record<string, { usd?: number; dkk?: number }>

  const now = new Date().toISOString()
  let updated = 0
  for (const [coinId, p] of Object.entries(prices)) {
    const result = db
      .query(`UPDATE stockmate_crypto_holding SET last_known_price_usd = ?, last_known_price_dkk = ?, last_price_updated = ? WHERE coin_id = ?`)
      .run(p.usd ?? null, p.dkk ?? null, now, coinId)
    updated += result.changes
  }
  return updated
}

export interface HistoricalPrice {
  timestamp: number
  close: number
}

/** Historiske dagspriser (i USD) for én møntart – til en graf. */
export async function getCryptoHistoricalPrices(coinId: string, days: string): Promise<HistoricalPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`CoinGecko API fejl: ${res.status}`)
  const data = (await res.json()) as { prices?: [number, number][] }
  return (data.prices ?? []).map(([timestampMs, close]) => ({ timestamp: Math.round(timestampMs / 1000), close }))
}

/**
 * Uphold CSV-kolonner: Date, Destination, Origin, Message, Status, Transaction ID, Network,
 * Destination Currency, Destination Amount, Origin Currency, Origin Amount, Fee Currency, Fee Amount.
 * Nettosaldo pr. valuta: Destination Amount er modtaget (+), Origin Amount er sendt (-).
 * Kun rækker med Status 'completed'/'ok' tæller med.
 */
export function importUpholdCsv(csvContent: string): number {
  const rows = parseCsv(csvContent)
  if (!rows.length) throw new Error('Tom CSV-fil')
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const col = (name: string) => {
    const i = headers.indexOf(name.toLowerCase())
    if (i < 0) throw new Error(`Kolonnen '${name}' blev ikke fundet i CSV'en`)
    return i
  }
  const idxOriginAmount = col('Origin Amount')
  const idxOriginCurrency = col('Origin Currency')
  const idxDestAmount = col('Destination Amount')
  const idxDestCurrency = col('Destination Currency')
  const idxStatus = col('Status')

  const balances = new Map<string, number>()
  for (const row of rows.slice(1)) {
    const status = (row[idxStatus] ?? '').trim().toLowerCase()
    if (status !== 'ok' && status !== 'completed') continue

    const originCurrency = (row[idxOriginCurrency] ?? '').trim().toUpperCase()
    const destCurrency = (row[idxDestCurrency] ?? '').trim().toUpperCase()
    const originAmount = Number((row[idxOriginAmount] ?? '0').trim()) || 0
    const destAmount = Number((row[idxDestAmount] ?? '0').trim()) || 0

    if (originCurrency && !isStablecoinOrFiat(destCurrency) && destAmount > 0) {
      balances.set(destCurrency, (balances.get(destCurrency) ?? 0) + destAmount)
    }
    if (!isStablecoinOrFiat(originCurrency) && originAmount > 0) {
      balances.set(originCurrency, (balances.get(originCurrency) ?? 0) - originAmount)
    }
  }

  let upserted = 0
  for (const [symbol, amount] of balances) {
    if (amount <= 0.0001) {
      db.query(`DELETE FROM stockmate_crypto_holding WHERE symbol = ? AND platform = 'uphold'`).run(symbol)
      continue
    }
    const coinId = symbolToCoinGeckoId(symbol)
    db.query(
      `INSERT INTO stockmate_crypto_holding (coin_id, symbol, name, amount, platform)
       VALUES (?, ?, ?, ?, 'uphold')
       ON CONFLICT(coin_id, platform) DO UPDATE SET amount = excluded.amount, name = excluded.name, updated_at = datetime('now')`,
    ).run(coinId, symbol, coinDisplayName(symbol), amount)
    upserted++
  }
  return upserted
}
