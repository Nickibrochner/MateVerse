import { Elysia, t } from 'elysia'
import { db } from '../../db'
import { HttpError, httpErrors, notFound, round2 } from '../../lib/http'
import { balances, byCategory, FREQUENCIES, monthly, paidBy, suggestTransfers, type ExpenseLike } from './calc'

const PAYMENT_METHODS = ['Betalingsservice', 'Kort', 'Overførsel', 'MobilePay', 'Kontant']
const CATEGORIES = [
  'Arbejde', 'Bolig', 'Transport', 'Forsikringer og Fagforening', 'Lån og Kredit', 'Abonnementer og Services', 'Diverse',
]

interface EventRow {
  id: number
  name: string
  event_type: 'budget' | 'project'
  start_date: string | null
  end_date: string | null
  budget_amount: number
  created_at: string
}
interface ExpenseRow extends ExpenseLike {
  id: number
  event_id: number
  description: string
  category: string | null
  expense_date: string
  payment_frequency: string | null
  payment_method: string | null
}

const getEvent = (id: number) => {
  const e = db.query('SELECT * FROM econmate_event WHERE id = ?').get(id) as EventRow | null
  if (!e) throw notFound('Begivenheden')
  return e
}
const membersOf = (eventId: number) =>
  (db.query('SELECT user_id FROM econmate_member WHERE event_id = ? ORDER BY user_id').all(eventId) as { user_id: number }[])
    .map(r => r.user_id)
const expensesOf = (eventId: number) =>
  db.query('SELECT * FROM econmate_expense WHERE event_id = ? ORDER BY expense_date DESC, id DESC').all(eventId) as ExpenseRow[]
const settlementsOf = (eventId: number) =>
  db.query('SELECT * FROM econmate_settlement WHERE event_id = ? ORDER BY settlement_date DESC, id DESC').all(eventId) as
    { id: number; payer_id: number; receiver_id: number; amount: number; settlement_date: string }[]

function setMembers(eventId: number, memberIds: number[]) {
  const ids = [...new Set(memberIds)]
  if (!ids.length) throw new HttpError(400, 'Vælg mindst én deltager')
  for (const id of ids) if (!db.query('SELECT 1 FROM user WHERE id = ?').get(id)) throw notFound('Brugeren')
  const used = db.query(
    `SELECT paid_by AS id FROM econmate_expense WHERE event_id = ?1 AND paid_by IS NOT NULL
     UNION SELECT payer_id FROM econmate_settlement WHERE event_id = ?1
     UNION SELECT receiver_id FROM econmate_settlement WHERE event_id = ?1`,
  ).all(eventId) as { id: number }[]
  const missing = used.filter(u => !ids.includes(u.id))
  if (missing.length) throw new HttpError(422, 'En deltager med udgifter eller udligninger kan ikke fjernes')
  db.query('DELETE FROM econmate_member WHERE event_id = ?').run(eventId)
  for (const id of ids) db.query('INSERT INTO econmate_member (event_id, user_id) VALUES (?, ?)').run(eventId, id)
}

function summary(eventId: number) {
  const members = membersOf(eventId)
  const expenses = expensesOf(eventId)
  const settlements = settlementsOf(eventId)
  const paid = paidBy(members, expenses)
  const paidMonthly = paidBy(members, expenses, monthly)
  const bal = balances(members, expenses, settlements)
  return {
    total: round2(expenses.reduce((s, e) => s + e.amount, 0)),
    monthly_total: round2(expenses.reduce((s, e) => s + monthly(e), 0)),
    members: members.map(id => ({
      user_id: id,
      paid: round2(paid.get(id)!),
      monthly: round2(paidMonthly.get(id)!),
      balance: round2(bal.get(id)!),
    })),
    categories: [...byCategory(expenses)].map(([category, amount]) => ({ category, monthly: round2(amount) }))
      .sort((a, b) => b.monthly - a.monthly),
    transfers: suggestTransfers(bal),
  }
}

const eventBody = t.Object({
  name: t.String({ minLength: 1 }),
  event_type: t.Union([t.Literal('budget'), t.Literal('project')]),
  start_date: t.Optional(t.Nullable(t.String())),
  end_date: t.Optional(t.Nullable(t.String())),
  budget_amount: t.Optional(t.Number({ minimum: 0 })),
  member_ids: t.Array(t.Integer()),
})

const expenseBody = t.Object({
  description: t.String({ minLength: 1 }),
  amount: t.Number(),
  paid_by: t.Nullable(t.Integer()),
  category: t.Optional(t.Nullable(t.String())),
  expense_date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  payment_frequency: t.Optional(t.Nullable(t.String())),
  payment_method: t.Optional(t.Nullable(t.String())),
})

const idParam = { params: t.Object({ id: t.Numeric() }) }

function checkPayer(eventId: number, paidBy: number | null) {
  if (paidBy != null && !membersOf(eventId).includes(paidBy)) throw new HttpError(422, 'Betaleren er ikke deltager')
}

const nullIfEmpty = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

export const econmate = new Elysia({ prefix: '/econmate' })
  .use(httpErrors)
  .get('/meta', () => ({ frequencies: FREQUENCIES, payment_methods: PAYMENT_METHODS, categories: CATEGORIES }))

  .get('/events', () => {
    const events = db.query('SELECT * FROM econmate_event ORDER BY created_at DESC, id DESC').all() as EventRow[]
    return events.map(e => {
      const s = summary(e.id)
      return { ...e, member_ids: membersOf(e.id), total: s.total, monthly_total: s.monthly_total }
    })
  })
  .post('/events', ({ body }) => db.transaction(() => {
    const { id } = db.query(
      `INSERT INTO econmate_event (name, event_type, start_date, end_date, budget_amount)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get(body.name.trim(), body.event_type, nullIfEmpty(body.start_date), nullIfEmpty(body.end_date), body.budget_amount ?? 0) as { id: number }
    setMembers(id, body.member_ids)
    return { ...getEvent(id), member_ids: membersOf(id) }
  })(), { body: eventBody })

  .get('/events/:id', ({ params }) => ({
    event: { ...getEvent(params.id), member_ids: membersOf(params.id) },
    expenses: expensesOf(params.id),
    settlements: settlementsOf(params.id),
    summary: summary(params.id),
  }), idParam)
  .put('/events/:id', ({ params, body }) => db.transaction(() => {
    getEvent(params.id)
    db.query('UPDATE econmate_event SET name = ?, event_type = ?, start_date = ?, end_date = ?, budget_amount = ? WHERE id = ?')
      .run(body.name.trim(), body.event_type, nullIfEmpty(body.start_date), nullIfEmpty(body.end_date), body.budget_amount ?? 0, params.id)
    setMembers(params.id, body.member_ids)
    return { ...getEvent(params.id), member_ids: membersOf(params.id) }
  })(), { ...idParam, body: eventBody })
  .delete('/events/:id', ({ params }) => {
    getEvent(params.id)
    db.query('DELETE FROM econmate_event WHERE id = ?').run(params.id)
    return { deleted: params.id }
  }, idParam)

  .post('/events/:id/expenses', ({ params, body }) => {
    getEvent(params.id)
    checkPayer(params.id, body.paid_by)
    return db.query(
      `INSERT INTO econmate_expense (event_id, description, amount, paid_by, category, expense_date, payment_frequency, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).get(params.id, body.description.trim(), body.amount, body.paid_by, nullIfEmpty(body.category), body.expense_date,
      nullIfEmpty(body.payment_frequency), nullIfEmpty(body.payment_method)) as ExpenseRow
  }, { ...idParam, body: expenseBody })
  .put('/expenses/:id', ({ params, body }) => {
    const row = db.query('SELECT event_id FROM econmate_expense WHERE id = ?').get(params.id) as { event_id: number } | null
    if (!row) throw notFound('Udgiften')
    checkPayer(row.event_id, body.paid_by)
    return db.query(
      `UPDATE econmate_expense SET description = ?, amount = ?, paid_by = ?, category = ?, expense_date = ?,
         payment_frequency = ?, payment_method = ? WHERE id = ? RETURNING *`,
    ).get(body.description.trim(), body.amount, body.paid_by, nullIfEmpty(body.category), body.expense_date,
      nullIfEmpty(body.payment_frequency), nullIfEmpty(body.payment_method), params.id) as ExpenseRow
  }, { ...idParam, body: expenseBody })
  .delete('/expenses/:id', ({ params }) => {
    if (!db.query('DELETE FROM econmate_expense WHERE id = ?').run(params.id).changes) throw notFound('Udgiften')
    return { deleted: params.id }
  }, idParam)

  .post('/events/:id/settlements', ({ params, body }) => {
    getEvent(params.id)
    const members = membersOf(params.id)
    if (!members.includes(body.payer_id) || !members.includes(body.receiver_id)) throw new HttpError(422, 'Begge skal være deltagere')
    if (body.payer_id === body.receiver_id) throw new HttpError(422, 'Betaler og modtager skal være forskellige')
    return db.query(
      'INSERT INTO econmate_settlement (event_id, payer_id, receiver_id, amount, settlement_date) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ).get(params.id, body.payer_id, body.receiver_id, body.amount, body.settlement_date ?? new Date().toISOString().slice(0, 10))
  }, {
    ...idParam,
    body: t.Object({
      payer_id: t.Integer(),
      receiver_id: t.Integer(),
      amount: t.Number({ exclusiveMinimum: 0 }),
      settlement_date: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    }),
  })
  .delete('/settlements/:id', ({ params }) => {
    if (!db.query('DELETE FROM econmate_settlement WHERE id = ?').run(params.id).changes) throw notFound('Udligningen')
    return { deleted: params.id }
  }, idParam)
