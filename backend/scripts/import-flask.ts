/**
 * Importerer data fra den gamle Flask-udgave af Stockmate (stockmate.db) til Mates-databasen.
 *
 *   bun run import-flask ../instance/stockmate.db
 *
 * Brugere matches på brugernavn. Gamle transaktioner havde ingen gemt valutakurs,
 * så dagens kurs bruges (samme adfærd som den gamle app). Scriptet kan køres flere gange –
 * transaktioner, der allerede er importeret, springes over.
 */
import { Database } from 'bun:sqlite'
import { db } from '../src/db'
import { getFxRate } from '../src/mates/stockmate/market'

const path = process.argv[2]
if (!path) {
  console.error('Angiv stien til den gamle stockmate.db')
  process.exit(1)
}

const old = new Database(path, { readonly: true })
const users = old.query('SELECT id, username FROM user').all() as { id: number; username: string }[]
const stocks = old.query('SELECT id, ticker, name, currency FROM stock').all() as
  { id: number; ticker: string; name: string | null; currency: string | null }[]
const txs = old.query('SELECT * FROM "transaction" ORDER BY transaction_date, id').all() as any[]

const userMap = new Map<number, number>()
for (const u of users) {
  db.query('INSERT OR IGNORE INTO user (username) VALUES (?)').run(u.username)
  userMap.set(u.id, (db.query('SELECT id FROM user WHERE username = ?').get(u.username) as { id: number }).id)
}

const stockMap = new Map<number, number>()
for (const s of stocks) {
  const ticker = s.ticker.toUpperCase()
  db.query('INSERT OR IGNORE INTO stockmate_stock (ticker, name, currency) VALUES (?, ?, ?)')
    .run(ticker, s.name && s.name !== s.ticker ? s.name : null, (s.currency ?? 'DKK').toUpperCase())
  stockMap.set(s.id, (db.query('SELECT id FROM stockmate_stock WHERE ticker = ?').get(ticker) as { id: number }).id)
}

const fx = new Map<string, number>()
for (const c of new Set(txs.map(t => (t.transaction_currency ?? 'DKK').toUpperCase()))) fx.set(c, await getFxRate(c))

const note = (id: number) => `Importeret fra Flask (#${id})`
let imported = 0
for (const t of txs) {
  if (db.query('SELECT 1 FROM stockmate_transaction WHERE note = ?').get(note(t.id))) continue
  const currency = (t.transaction_currency ?? 'DKK').toUpperCase()
  db.query(
    `INSERT INTO stockmate_transaction
       (user_id, stock_id, depot_type, type, quantity, price_per_share, currency, fx_rate, brokerage_fee, transaction_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userMap.get(t.user_id)!, stockMap.get(t.stock_id)!, t.depot_type, t.transaction_type, t.quantity,
    t.price_per_share, currency, fx.get(currency)!, t.brokerage_fee ?? 0, t.transaction_date, note(t.id),
  )
  imported++
}

console.log(`Importerede ${imported} transaktioner, ${users.length} brugere og ${stocks.length} aktier.`)
