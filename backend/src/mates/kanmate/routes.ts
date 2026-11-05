import { Elysia, t } from 'elysia'
import { db } from '../../db'
import { HttpError, httpErrors, notFound } from '../../lib/http'

export const COLUMNS = ['todo', 'doing', 'done'] as const

interface ProjectRow {
  id: number
  name: string
  color: string
  is_archived: number
  deleted_at: string | null
  created_at: string
}
interface TaskRow {
  id: number
  title: string
  description: string | null
  column_name: (typeof COLUMNS)[number]
  project_id: number | null
  position: number
  deadline: string | null
  priority: 'low' | 'medium' | 'high'
  assigned_to: number | null
  archived_at: string | null
  deleted_at: string | null
  updated_at: string
}
interface SubtaskRow {
  id: number
  task_id: number
  description: string
  is_completed: number
  position: number
}

const project = (p: ProjectRow) => ({ ...p, is_archived: !!p.is_archived })

/** Opgaver med underopgaver. `where` er en SQL-betingelse på kanmate_task (alias t). */
function tasks(where: string, ...params: (string | number | null)[]) {
  const rows = db.query(
    `SELECT t.* FROM kanmate_task t LEFT JOIN kanmate_project p ON p.id = t.project_id
     WHERE ${where} ORDER BY t.position, t.id`,
  ).all(...params) as TaskRow[]
  if (!rows.length) return []
  const subs = db.query(
    `SELECT * FROM kanmate_subtask WHERE task_id IN (${rows.map(() => '?').join(',')}) ORDER BY position, id`,
  ).all(...rows.map(r => r.id)) as SubtaskRow[]
  return rows.map(r => ({
    ...r,
    subtasks: subs.filter(s => s.task_id === r.id).map(s => ({ ...s, is_completed: !!s.is_completed })),
  }))
}

const ACTIVE = 't.deleted_at IS NULL AND t.archived_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)'

function getTask(id: number) {
  const [task] = tasks('t.id = ?', id)
  if (!task) throw notFound('Opgaven')
  return task
}

const nextPosition = (column: string) =>
  ((db.query('SELECT MAX(position) AS m FROM kanmate_task WHERE column_name = ?').get(column) as { m: number | null }).m ?? 0) + 1

function checkRefs(body: { project_id?: number | null; assigned_to?: number | null }) {
  if (body.project_id != null && !db.query('SELECT 1 FROM kanmate_project WHERE id = ? AND deleted_at IS NULL').get(body.project_id))
    throw notFound('Projektet')
  if (body.assigned_to != null && !db.query('SELECT 1 FROM user WHERE id = ?').get(body.assigned_to)) throw notFound('Brugeren')
}

function saveSubtasks(taskId: number, subtasks: { description: string; is_completed: boolean }[]) {
  db.query('DELETE FROM kanmate_subtask WHERE task_id = ?').run(taskId)
  subtasks
    .filter(s => s.description.trim())
    .forEach((s, i) =>
      db.query('INSERT INTO kanmate_subtask (task_id, description, is_completed, position) VALUES (?, ?, ?, ?)')
        .run(taskId, s.description.trim(), s.is_completed ? 1 : 0, i))
}

const column = t.Union(COLUMNS.map(c => t.Literal(c)))
const taskBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  column_name: column,
  project_id: t.Nullable(t.Integer()),
  deadline: t.Optional(t.Nullable(t.String())),
  priority: t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high')]),
  assigned_to: t.Nullable(t.Integer()),
  subtasks: t.Array(t.Object({ description: t.String(), is_completed: t.Boolean() })),
})
const projectBody = t.Object({
  name: t.String({ minLength: 1 }),
  color: t.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
  is_archived: t.Optional(t.Boolean()),
})
const idParam = { params: t.Object({ id: t.Numeric() }) }
const emptyToNull = (s?: string | null) => (s?.trim() ? s.trim() : null)

export const kanmate = new Elysia({ prefix: '/kanmate' })
  .use(httpErrors)

  // ── Projekter ──
  .get('/projects', () => {
    const rows = db.query('SELECT * FROM kanmate_project WHERE deleted_at IS NULL ORDER BY is_archived, name COLLATE NOCASE').all() as ProjectRow[]
    const counts = db.query(
      `SELECT project_id, column_name, COUNT(*) AS n FROM kanmate_task
       WHERE deleted_at IS NULL AND archived_at IS NULL AND project_id IS NOT NULL GROUP BY project_id, column_name`,
    ).all() as { project_id: number; column_name: string; n: number }[]
    return rows.map(p => ({
      ...project(p),
      counts: Object.fromEntries(COLUMNS.map(c => [c, counts.find(x => x.project_id === p.id && x.column_name === c)?.n ?? 0])),
    }))
  })
  .post('/projects', ({ body }) => project(db.query(
    'INSERT INTO kanmate_project (name, color, is_archived) VALUES (?, ?, ?) RETURNING *',
  ).get(body.name.trim(), body.color, body.is_archived ? 1 : 0) as ProjectRow), { body: projectBody })
  .put('/projects/:id', ({ params, body }) => {
    const row = db.query('UPDATE kanmate_project SET name = ?, color = ?, is_archived = ? WHERE id = ? AND deleted_at IS NULL RETURNING *')
      .get(body.name.trim(), body.color, body.is_archived ? 1 : 0, params.id) as ProjectRow | null
    if (!row) throw notFound('Projektet')
    return project(row)
  }, { ...idParam, body: projectBody })
  /** Projektet lægges i papirkurven; opgaverne følger med og kommer tilbage ved gendannelse. */
  .delete('/projects/:id', ({ params }) => {
    if (!db.query("UPDATE kanmate_project SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(params.id).changes)
      throw notFound('Projektet')
    return { deleted: params.id }
  }, idParam)

  // ── Opgaver ──
  .get('/tasks', ({ query }) =>
    query.project_id != null ? tasks(`${ACTIVE} AND t.project_id = ?`, query.project_id) : tasks(ACTIVE),
  { query: t.Object({ project_id: t.Optional(t.Numeric()) }) })
  .post('/tasks', ({ body }) => {
    checkRefs(body)
    return db.transaction(() => {
      const { id } = db.query(
        `INSERT INTO kanmate_task (title, description, column_name, project_id, position, deadline, priority, assigned_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).get(body.title.trim(), emptyToNull(body.description), body.column_name, body.project_id, nextPosition(body.column_name),
        emptyToNull(body.deadline), body.priority, body.assigned_to) as { id: number }
      saveSubtasks(id, body.subtasks)
      return getTask(id)
    })()
  }, { body: taskBody })
  .put('/tasks/:id', ({ params, body }) => {
    const current = getTask(params.id)
    checkRefs(body)
    return db.transaction(() => {
      const position = current.column_name === body.column_name ? current.position : nextPosition(body.column_name)
      db.query(
        `UPDATE kanmate_task SET title = ?, description = ?, column_name = ?, project_id = ?, position = ?, deadline = ?,
           priority = ?, assigned_to = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(body.title.trim(), emptyToNull(body.description), body.column_name, body.project_id, position,
        emptyToNull(body.deadline), body.priority, body.assigned_to, params.id)
      saveSubtasks(params.id, body.subtasks)
      return getTask(params.id)
    })()
  }, { ...idParam, body: taskBody })
  /**
   * Flyt en opgave til en kolonne. `before` er id'et på den opgave, den skal placeres foran;
   * uden `before` lægges den nederst.
   */
  .post('/tasks/:id/move', ({ params, body }) => {
    getTask(params.id)
    let position = nextPosition(body.column_name)
    if (body.before != null) {
      const before = db.query('SELECT position FROM kanmate_task WHERE id = ?').get(body.before) as { position: number } | null
      if (!before) throw notFound('Opgaven')
      const prev = db.query(
        'SELECT MAX(position) AS m FROM kanmate_task WHERE column_name = ? AND position < ? AND id != ?',
      ).get(body.column_name, before.position, params.id) as { m: number | null }
      position = ((prev.m ?? before.position - 1) + before.position) / 2
    }
    db.query("UPDATE kanmate_task SET column_name = ?, position = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body.column_name, position, params.id)
    return getTask(params.id)
  }, { ...idParam, body: t.Object({ column_name: column, before: t.Optional(t.Nullable(t.Integer())) }) })
  .delete('/tasks/:id', ({ params }) => {
    if (!db.query("UPDATE kanmate_task SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(params.id).changes)
      throw notFound('Opgaven')
    return { deleted: params.id }
  }, idParam)
  .post('/subtasks/:id/toggle', ({ params }) => {
    const row = db.query('UPDATE kanmate_subtask SET is_completed = 1 - is_completed WHERE id = ? RETURNING task_id').get(params.id) as
      { task_id: number } | null
    if (!row) throw notFound('Underopgaven')
    return getTask(row.task_id)
  }, idParam)

  // ── Arkiv ──
  .get('/archive', () => tasks('t.deleted_at IS NULL AND t.archived_at IS NOT NULL').sort((a, b) => b.archived_at!.localeCompare(a.archived_at!)))
  .post('/tasks/:id/archive', ({ params }) => {
    const task = getTask(params.id)
    if (task.column_name !== 'done') throw new HttpError(422, 'Kun færdige opgaver kan arkiveres')
    db.query("UPDATE kanmate_task SET archived_at = datetime('now') WHERE id = ?").run(params.id)
    return { archived: params.id }
  }, idParam)
  .post('/tasks/:id/unarchive', ({ params }) => {
    getTask(params.id)
    db.query('UPDATE kanmate_task SET archived_at = NULL WHERE id = ?').run(params.id)
    return getTask(params.id)
  }, idParam)
  .post('/archive-done', ({ body }) => {
    const res = body.project_id != null
      ? db.query(`UPDATE kanmate_task SET archived_at = datetime('now')
                  WHERE column_name = 'done' AND deleted_at IS NULL AND archived_at IS NULL AND project_id = ?`).run(body.project_id)
      : db.query(`UPDATE kanmate_task SET archived_at = datetime('now')
                  WHERE column_name = 'done' AND deleted_at IS NULL AND archived_at IS NULL`).run()
    return { archived: res.changes }
  }, { body: t.Object({ project_id: t.Optional(t.Nullable(t.Integer())) }) })

  // ── Papirkurv ──
  .get('/trash', () => ({
    projects: (db.query('SELECT * FROM kanmate_project WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all() as ProjectRow[]).map(project),
    tasks: tasks('t.deleted_at IS NOT NULL').sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!)),
  }))
  .post('/trash/projects/:id/restore', ({ params }) => {
    if (!db.query('UPDATE kanmate_project SET deleted_at = NULL WHERE id = ?').run(params.id).changes) throw notFound('Projektet')
    return { restored: params.id }
  }, idParam)
  .post('/trash/tasks/:id/restore', ({ params }) => {
    if (!db.query('UPDATE kanmate_task SET deleted_at = NULL WHERE id = ?').run(params.id).changes) throw notFound('Opgaven')
    return { restored: params.id }
  }, idParam)
  /** Tømmer papirkurven permanent. */
  .delete('/trash', () => db.transaction(() => {
    const t1 = db.query('DELETE FROM kanmate_task WHERE deleted_at IS NOT NULL').run().changes
    const t2 = db.query(
      'DELETE FROM kanmate_task WHERE project_id IN (SELECT id FROM kanmate_project WHERE deleted_at IS NOT NULL)',
    ).run().changes
    const p = db.query('DELETE FROM kanmate_project WHERE deleted_at IS NOT NULL').run().changes
    return { tasks: t1 + t2, projects: p }
  })())
