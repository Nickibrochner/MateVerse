/**
 * Importerer data fra den gamle Tauri-udgave af Econmate (econmate.db) til Mates-databasen.
 *
 *   bun run import-econmate ../import/econmate.db
 *
 * Personer matches på navn og bliver til hubbrugere. Personen "Fælles" er ikke en bruger –
 * udgifter, hvor "Fælles" har lagt ud, bliver til paid_by = NULL (fælles udgift, jf. calc.ts).
 * Deltagere i en begivenhed er alle brugere, der forekommer som betaler af en udgift eller
 * part i en udligning for den begivenhed. Scriptet kan køres flere gange – begivenheder,
 * udgifter og udligninger, der allerede er importeret, springes over (matchet på indhold,
 * da den gamle database ikke har en stabil reference, vi kan gemme).
 */
import { Database } from 'bun:sqlite'
import { db } from '../src/db'

const path = process.argv[2]
if (!path) {
  console.error('Angiv stien til den gamle econmate.db')
  process.exit(1)
}

const FAELLES = 'Fælles'
const old = new Database(path, { readonly: true })

interface OldPerson { id: string; name: string }
interface OldEvent {
  id: string
  name: string
  event_type: string
  start_date: string | null
  end_date: string | null
  budget_amount: number
}
interface OldExpense {
  id: string
  event_id: string
  description: string
  amount: number
  incurred_by: string | null
  category: string | null
  expense_date: string
  payment_frequency: string | null
  payment_method: string | null
}
interface OldSettlement {
  id: string
  event_id: string
  payer: string
  receiver: string
  amount: number
  settlement_date: string
}

const persons = old.query('SELECT id, name FROM person').all() as OldPerson[]
const events = old.query('SELECT id, name, event_type, start_date, end_date, budget_amount FROM event').all() as OldEvent[]
const expenses = old.query('SELECT id, event_id, description, amount, incurred_by, category, expense_date, payment_frequency, payment_method FROM expense').all() as OldExpense[]
const settlements = old.query('SELECT id, event_id, payer, receiver, amount, settlement_date FROM settlement').all() as OldSettlement[]

// Personer → hubbrugere. "Fælles" oprettes ikke som bruger.
const userIdByName = new Map<string, number>()
for (const p of persons) {
  if (p.name === FAELLES) continue
  db.query('INSERT OR IGNORE INTO user (username) VALUES (?)').run(p.name)
  userIdByName.set(p.name, (db.query('SELECT id FROM user WHERE username = ?').get(p.name) as { id: number }).id)
}
/** NULL for "Fælles" (fælles udgift). Ukendte navne (bør ikke forekomme) ender også som NULL. */
const userId = (name: string | null) => (name == null || name === FAELLES ? null : userIdByName.get(name) ?? null)

const nullIfEmpty = (s: string | null) => (s?.trim() ? s.trim() : null)

let eventsCreated = 0, expensesImported = 0, settlementsImported = 0

for (const ev of events) {
  if (ev.event_type !== 'budget' && ev.event_type !== 'project') {
    console.warn(`Springer "${ev.name}" over – ukendt event_type "${ev.event_type}"`)
    continue
  }

  let eventId = (db.query('SELECT id FROM econmate_event WHERE name = ? AND event_type = ?').get(ev.name, ev.event_type) as { id: number } | null)?.id
  if (eventId == null) {
    eventId = (db.query(
      `INSERT INTO econmate_event (name, event_type, start_date, end_date, budget_amount) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get(ev.name, ev.event_type, nullIfEmpty(ev.start_date), nullIfEmpty(ev.end_date), ev.budget_amount ?? 0) as { id: number }).id
    eventsCreated++
  }

  const ownExpenses = expenses.filter(e => e.event_id === ev.id)
  const ownSettlements = settlements.filter(s => s.event_id === ev.id)

  // Deltagere: alle brugere, der har lagt ud eller er part i en udligning for begivenheden.
  const memberIds = new Set<number>()
  for (const e of ownExpenses) { const id = userId(e.incurred_by); if (id != null) memberIds.add(id) }
  for (const s of ownSettlements) {
    const payer = userId(s.payer), receiver = userId(s.receiver)
    if (payer != null) memberIds.add(payer)
    if (receiver != null) memberIds.add(receiver)
  }
  for (const id of memberIds) db.query('INSERT OR IGNORE INTO econmate_member (event_id, user_id) VALUES (?, ?)').run(eventId, id)

  for (const e of ownExpenses) {
    const paidBy = userId(e.incurred_by)
    const exists = db.query(
      `SELECT 1 FROM econmate_expense WHERE event_id = ?1 AND description = ?2 AND amount = ?3 AND expense_date = ?4
         AND (category IS ?5) AND (paid_by IS ?6)`,
    ).get(eventId, e.description, e.amount, e.expense_date, nullIfEmpty(e.category), paidBy)
    if (exists) continue
    db.query(
      `INSERT INTO econmate_expense (event_id, description, amount, paid_by, category, expense_date, payment_frequency, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(eventId, e.description, e.amount, paidBy, nullIfEmpty(e.category), e.expense_date, nullIfEmpty(e.payment_frequency), nullIfEmpty(e.payment_method))
    expensesImported++
  }

  for (const s of ownSettlements) {
    const payerId = userId(s.payer), receiverId = userId(s.receiver)
    if (payerId == null || receiverId == null) {
      console.warn(`Springer en udligning i "${ev.name}" over – ukendt betaler/modtager ("${s.payer}" → "${s.receiver}")`)
      continue
    }
    const exists = db.query(
      'SELECT 1 FROM econmate_settlement WHERE event_id = ? AND payer_id = ? AND receiver_id = ? AND amount = ? AND settlement_date = ?',
    ).get(eventId, payerId, receiverId, s.amount, s.settlement_date)
    if (exists) continue
    db.query('INSERT INTO econmate_settlement (event_id, payer_id, receiver_id, amount, settlement_date) VALUES (?, ?, ?, ?, ?)')
      .run(eventId, payerId, receiverId, s.amount, s.settlement_date)
    settlementsImported++
  }
}

console.log(`Importerede ${eventsCreated} nye begivenheder, ${expensesImported} udgifter og ${settlementsImported} udligninger (${persons.length} personer set).`)
