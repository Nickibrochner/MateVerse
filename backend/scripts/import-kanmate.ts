/**
 * Importerer data fra den gamle Tauri-udgave af KanMate (kanmate.db) til Mates-databasen.
 *
 *   bun run import-kanmate ../import/kanmate.db
 *
 * Brugerne (navn) bliver til hubbrugere – nye navne, der ikke allerede findes i hubben
 * (fx "William Otto"), oprettes. Kolonnenavne og underopgaver har andre navne/felter i den
 * nye model, så de oversættes undervejs. Scriptet kan køres flere gange – den gamle database
 * har ingen stabil reference, vi kan gemme, så opgaver matches på titel + oprettelsestidspunkt
 * (sekundpræcist og i praksis unikt for et personligt board) og springes over, hvis de allerede findes.
 */
import { Database } from 'bun:sqlite'
import { db } from '../src/db'

const path = process.argv[2]
if (!path) {
  console.error('Angiv stien til den gamle kanmate.db')
  process.exit(1)
}

const old = new Database(path, { readonly: true })

interface OldUser { id: string; name: string }
interface OldProject { id: string; name: string; color: string; is_archived: number; deleted_at: string | null; created_at: string }
interface OldTask {
  id: string; title: string; description: string | null; column_name: string; project_id: string | null
  deadline: string | null; assigned_to: string | null; deleted_at: string | null; priority: string; archived_at: string | null
  created_at: string; updated_at: string
}
interface OldSubtask { id: string; task_id: string; description: string; is_completed: number }

const users = old.query('SELECT id, name FROM user').all() as OldUser[]
const projects = old.query('SELECT id, name, color, is_archived, deleted_at, created_at FROM project').all() as OldProject[]
const tasks = old.query('SELECT id, title, description, column_name, project_id, deadline, assigned_to, deleted_at, priority, archived_at, created_at, updated_at FROM task ORDER BY position').all() as OldTask[]
const subtasks = old.query('SELECT id, task_id, description, is_completed FROM subtask ORDER BY task_id, rowid').all() as OldSubtask[]

const COLUMN: Record<string, string> = { 'To Do': 'todo', Igang: 'doing', Done: 'done' }
const PRIORITY: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' }

const nullIfEmpty = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

// Brugere → hubbrugere.
const userIdByOldId = new Map<string, number>()
for (const u of users) {
  db.query('INSERT OR IGNORE INTO user (username) VALUES (?)').run(u.name)
  userIdByOldId.set(u.id, (db.query('SELECT id FROM user WHERE username = ?').get(u.name) as { id: number }).id)
}

let projectsCreated = 0, tasksCreated = 0, subtasksCreated = 0

const projectIdByOldId = new Map<string, number>()
for (const p of projects) {
  const existing = db.query('SELECT id FROM kanmate_project WHERE name = ? AND color = ?').get(p.name, p.color) as { id: number } | null
  let id = existing?.id
  if (id == null) {
    id = (db.query(
      `INSERT INTO kanmate_project (name, color, is_archived, deleted_at, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get(p.name, p.color, p.is_archived ? 1 : 0, p.deleted_at, p.created_at) as { id: number }).id
    projectsCreated++
  }
  projectIdByOldId.set(p.id, id)
}

for (const t of tasks) {
  const title = t.title.trim()
  if (db.query('SELECT 1 FROM kanmate_task WHERE title = ? AND created_at = ?').get(title, t.created_at)) continue

  const column = COLUMN[t.column_name] ?? 'todo'
  const priority = PRIORITY[t.priority] ?? 'medium'
  const projectId = t.project_id != null ? projectIdByOldId.get(t.project_id) ?? null : null
  const assignedTo = t.assigned_to != null ? userIdByOldId.get(t.assigned_to) ?? null : null

  const { id: taskId } = db.query(
    `INSERT INTO kanmate_task (title, description, column_name, project_id, deadline, priority, assigned_to, archived_at, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).get(
    title, nullIfEmpty(t.description), column, projectId, nullIfEmpty(t.deadline), priority, assignedTo,
    t.archived_at, t.deleted_at, t.created_at, t.updated_at,
  ) as { id: number }
  tasksCreated++

  let position = 0
  for (const s of subtasks.filter(s => s.task_id === t.id)) {
    db.query('INSERT INTO kanmate_subtask (task_id, description, is_completed, position) VALUES (?, ?, ?, ?)')
      .run(taskId, s.description, s.is_completed ? 1 : 0, position++)
    subtasksCreated++
  }
}

console.log(`Importerede ${projectsCreated} nye projekter, ${tasksCreated} opgaver og ${subtasksCreated} underopgaver (${users.length} brugere set).`)
