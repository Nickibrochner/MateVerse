import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Testene kører mod en tom database i en midlertidig mappe
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'stockmate-crypto-')), 'test.sqlite')
let crypto: typeof import('./crypto')
let db: typeof import('../../db').db
beforeAll(async () => {
  crypto = await import('./crypto')
  ;({ db } = await import('../../db'))
})

describe('mønt-mapping', () => {
  test('kendte symboler slås op, ukendte falder tilbage til små bogstaver', async () => {
    expect(crypto.symbolToCoinGeckoId('BTC')).toBe('bitcoin')
    expect(crypto.symbolToCoinGeckoId('eth')).toBe('ethereum')
    expect(crypto.symbolToCoinGeckoId('SOMENEWCOIN')).toBe('somenewcoin')
  })

  test('stablecoins og fiat genkendes', () => {
    expect(crypto.isStablecoinOrFiat('USDC')).toBe(true)
    expect(crypto.isStablecoinOrFiat('DKK')).toBe(true)
    expect(crypto.isStablecoinOrFiat('BTC')).toBe(false)
  })
})

describe('indstillinger', () => {
  test('gemmes og hentes, ukendt nøgle giver null', () => {
    expect(crypto.getSetting('coinbase_key_name')).toBeNull()
    crypto.saveSetting('coinbase_key_name', 'organizations/abc/apiKeys/def')
    expect(crypto.getSetting('coinbase_key_name')).toBe('organizations/abc/apiKeys/def')
    crypto.saveSetting('coinbase_key_name', 'ny-vaerdi')
    expect(crypto.getSetting('coinbase_key_name')).toBe('ny-vaerdi')
  })
})

describe('Uphold CSV-import', () => {
  const CSV = [
    'Date,Destination,Origin,Message,Status,Transaction ID,Network,Destination Currency,Destination Amount,Origin Currency,Origin Amount,Fee Currency,Fee Amount',
    '2024-01-01,card,card,,completed,1,bitcoin,BTC,0.5,DKK,1000,,',
    '2024-02-01,card,card,,completed,2,bitcoin,DKK,500,BTC,0.1,,',
    '2024-03-01,card,card,,failed,3,bitcoin,BTC,1,DKK,2000,,',
    '2024-04-01,card,card,,completed,4,bitcoin,USDC,10,BTC,0.01,,',
  ].join('\n')

  test('nettosaldo beregnes korrekt, kun gennemførte rækker tæller med', () => {
    const imported = crypto.importUpholdCsv(CSV)
    expect(imported).toBe(1) // kun BTC har en positiv nettosaldo – USDC er stablecoin og springes over

    const row = db.query(`SELECT * FROM stockmate_crypto_holding WHERE symbol = 'BTC' AND platform = 'uphold'`).get() as any
    expect(row.amount).toBeCloseTo(0.5 - 0.1 - 0.01, 6) // modtaget 0.5, sendt 0.1 og 0.01 (den fejlede række tæller ikke)
  })

  test('en efterfølgende import med nulsaldo fjerner beholdningen igen', () => {
    const CSV_SELL_ALL = [
      'Date,Destination,Origin,Message,Status,Transaction ID,Network,Destination Currency,Destination Amount,Origin Currency,Origin Amount,Fee Currency,Fee Amount',
      '2024-05-01,card,card,,completed,5,bitcoin,DKK,50000,BTC,1,,',
    ].join('\n')
    crypto.importUpholdCsv(CSV_SELL_ALL)
    const row = db.query(`SELECT * FROM stockmate_crypto_holding WHERE symbol = 'BTC' AND platform = 'uphold'`).get()
    expect(row).toBeNull()
  })

  test('ukendt kolonne giver en forståelig fejl', () => {
    expect(() => crypto.importUpholdCsv('Foo,Bar\n1,2')).toThrow("Kolonnen 'Origin Amount'")
  })
})
