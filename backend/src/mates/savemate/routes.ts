import { Elysia, t } from 'elysia'
import { db } from '../../db'
import { HttpError, httpErrors, notFound, round2 } from '../../lib/http'
import { goalStats, overallMonthly, recentMonthly } from './calc'

interface GoalRow {
  id: number
  name: string
  target_amount: number
  target_date: string
  owner_id: number | null
  icon: string
  created_at: string
}
interface ContributionRow {
  id: number
  goal_id: number | null
  amount: number
  contribution_date: string
  description: string | null
  is_lump_sum: number
}

const today = () => new Date().toISOString().slice(0, 10)
const contribution = (c: ContributionRow) => ({ ...c, is_lump_sum: !!c.is_lump_sum })
const contributionsOf = (goalId: number) =>
  (db.query('SELECT * FROM savemate_contribution WHERE goal_id = ? ORDER BY contribution_date DESC, id DESC').all(goalId) as ContributionRow[])
    .map(contribution)

function withStats(goal: GoalRow) {
  const cs = contributionsOf(goal.id)
  const saved = cs.reduce((s, c) => s + c.amount, 0)
  const recent = recentMonthly(cs, today())
  const stats = goalStats(goal, saved, today(), recent)
  return {
    ...goal,
    saved: round2(stats.saved),
    remaining: round2(stats.remaining),
    progress: stats.progress,
    months_left: Math.round(stats.months_left * 10) / 10,
    monthly_needed: round2(stats.monthly_needed),
    recent_monthly: round2(recent),
    status: stats.status,
  }
}

function getGoal(id: number) {
  const g = db.query('SELECT * FROM savemate_goal WHERE id = ?').get(id) as GoalRow | null
  if (!g) throw notFound('Opsparingsmålet')
  return g
}

const date = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
const goalBody = t.Object({
  name: t.String({ minLength: 1 }),
  target_amount: t.Number({ exclusiveMinimum: 0 }),
  target_date: date,
  owner_id: t.Nullable(t.Integer()),
  icon: t.Optional(t.String({ maxLength: 8 })),
})
const contributionBody = t.Object({
  goal_id: t.Nullable(t.Integer()),
  amount: t.Number(),
  contribution_date: date,
  description: t.Optional(t.Nullable(t.String())),
  is_lump_sum: t.Boolean(),
})
const idParam = { params: t.Object({ id: t.Numeric() }) }

function checkContribution(body: typeof contributionBody.static) {
  if (body.amount === 0) throw new HttpError(400, 'Beløbet må ikke være 0')
  if (body.goal_id != null) getGoal(body.goal_id)
  else if (!body.is_lump_sum) throw new HttpError(400, 'Generelle indbetalinger skal være engangsbeløb')
  if (body.goal_id == null && body.amount < 0) throw new HttpError(400, 'Generelle engangsbeløb skal være positive')
}

function checkOwner(ownerId: number | null) {
  if (ownerId != null && !db.query('SELECT 1 FROM user WHERE id = ?').get(ownerId)) throw notFound('Brugeren')
}

export const savemate = new Elysia({ prefix: '/savemate' })
  .use(httpErrors)
  .get('/overview', () => {
    const goals = (db.query('SELECT * FROM savemate_goal ORDER BY target_date').all() as GoalRow[]).map(withStats)
    const general = (db.query('SELECT * FROM savemate_contribution WHERE goal_id IS NULL ORDER BY contribution_date DESC, id DESC').all() as ContributionRow[])
      .map(contribution)
    const generalSum = general.reduce((s, c) => s + c.amount, 0)
    return {
      goals,
      general_lump_sums: general,
      totals: {
        target: round2(goals.reduce((s, g) => s + g.target_amount, 0)),
        saved: round2(goals.reduce((s, g) => s + g.saved, 0) + generalSum),
        general: round2(generalSum),
        monthly_needed: round2(overallMonthly(goals, generalSum, today())),
      },
    }
  })
  .post('/goals', ({ body }) => {
    checkOwner(body.owner_id)
    return withStats(db.query(
      'INSERT INTO savemate_goal (name, target_amount, target_date, owner_id, icon) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ).get(body.name.trim(), body.target_amount, body.target_date, body.owner_id, body.icon || '🎯') as GoalRow)
  }, { body: goalBody })
  .get('/goals/:id', ({ params }) => {
    const goal = withStats(getGoal(params.id))
    return { goal, contributions: contributionsOf(params.id) }
  }, idParam)
  .put('/goals/:id', ({ params, body }) => {
    getGoal(params.id)
    checkOwner(body.owner_id)
    return withStats(db.query(
      'UPDATE savemate_goal SET name = ?, target_amount = ?, target_date = ?, owner_id = ?, icon = ? WHERE id = ? RETURNING *',
    ).get(body.name.trim(), body.target_amount, body.target_date, body.owner_id, body.icon || '🎯', params.id) as GoalRow)
  }, { ...idParam, body: goalBody })
  .delete('/goals/:id', ({ params }) => {
    getGoal(params.id)
    db.query('DELETE FROM savemate_goal WHERE id = ?').run(params.id)
    return { deleted: params.id }
  }, idParam)

  .post('/contributions', ({ body }) => {
    checkContribution(body)
    return contribution(db.query(
      'INSERT INTO savemate_contribution (goal_id, amount, contribution_date, description, is_lump_sum) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ).get(body.goal_id, body.amount, body.contribution_date, body.description?.trim() || null, body.is_lump_sum ? 1 : 0) as ContributionRow)
  }, { body: contributionBody })
  .put('/contributions/:id', ({ params, body }) => {
    checkContribution(body)
    const row = db.query(
      'UPDATE savemate_contribution SET goal_id = ?, amount = ?, contribution_date = ?, description = ?, is_lump_sum = ? WHERE id = ? RETURNING *',
    ).get(body.goal_id, body.amount, body.contribution_date, body.description?.trim() || null, body.is_lump_sum ? 1 : 0, params.id) as ContributionRow | null
    if (!row) throw notFound('Indbetalingen')
    return contribution(row)
  }, { ...idParam, body: contributionBody })
  .delete('/contributions/:id', ({ params }) => {
    if (!db.query('DELETE FROM savemate_contribution WHERE id = ?').run(params.id).changes) throw notFound('Indbetalingen')
    return { deleted: params.id }
  }, idParam)
