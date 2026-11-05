import { json, request } from '../../api'

export type Column = 'todo' | 'doing' | 'done'
export type Priority = 'low' | 'medium' | 'high'

export const COLUMNS: { id: Column; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'I gang' },
  { id: 'done', label: 'Færdig' },
]
export const PRIORITIES: { id: Priority; label: string; dot: string }[] = [
  { id: 'high', label: 'Høj', dot: 'bg-red-500' },
  { id: 'medium', label: 'Middel', dot: 'bg-amber-400' },
  { id: 'low', label: 'Lav', dot: 'bg-stone-300' },
]
export const PROJECT_COLORS = ['#1d4ed8', '#047857', '#b45309', '#be185d', '#7c3aed', '#0e7490', '#b91c1c', '#64748b']

export interface Project {
  id: number
  name: string
  color: string
  is_archived: boolean
  deleted_at: string | null
  counts?: Record<Column, number>
}

export interface Subtask {
  id: number
  description: string
  is_completed: boolean
}

export interface Task {
  id: number
  title: string
  description: string | null
  column_name: Column
  project_id: number | null
  position: number
  deadline: string | null
  priority: Priority
  assigned_to: number | null
  archived_at: string | null
  deleted_at: string | null
  subtasks: Subtask[]
}

export interface TaskInput {
  title: string
  description: string | null
  column_name: Column
  project_id: number | null
  deadline: string | null
  priority: Priority
  assigned_to: number | null
  subtasks: { description: string; is_completed: boolean }[]
}

export type ProjectInput = Pick<Project, 'name' | 'color' | 'is_archived'>

const base = '/kanmate'

export const kanApi = {
  projects: () => request<Project[]>(`${base}/projects`),
  createProject: (body: ProjectInput) => request<Project>(`${base}/projects`, json('POST', body)),
  updateProject: (id: number, body: ProjectInput) => request<Project>(`${base}/projects/${id}`, json('PUT', body)),
  deleteProject: (id: number) => request(`${base}/projects/${id}`, { method: 'DELETE' }),
  tasks: (projectId?: number) => request<Task[]>(`${base}/tasks${projectId != null ? `?project_id=${projectId}` : ''}`),
  createTask: (body: TaskInput) => request<Task>(`${base}/tasks`, json('POST', body)),
  updateTask: (id: number, body: TaskInput) => request<Task>(`${base}/tasks/${id}`, json('PUT', body)),
  moveTask: (id: number, column_name: Column, before: number | null = null) =>
    request<Task>(`${base}/tasks/${id}/move`, json('POST', { column_name, before })),
  deleteTask: (id: number) => request(`${base}/tasks/${id}`, { method: 'DELETE' }),
  toggleSubtask: (id: number) => request<Task>(`${base}/subtasks/${id}/toggle`, { method: 'POST' }),
  archive: () => request<Task[]>(`${base}/archive`),
  archiveTask: (id: number) => request(`${base}/tasks/${id}/archive`, { method: 'POST' }),
  unarchiveTask: (id: number) => request<Task>(`${base}/tasks/${id}/unarchive`, { method: 'POST' }),
  archiveDone: (project_id: number | null) => request<{ archived: number }>(`${base}/archive-done`, json('POST', { project_id })),
  trash: () => request<{ projects: Project[]; tasks: Task[] }>(`${base}/trash`),
  restoreProject: (id: number) => request(`${base}/trash/projects/${id}/restore`, { method: 'POST' }),
  restoreTask: (id: number) => request(`${base}/trash/tasks/${id}/restore`, { method: 'POST' }),
  emptyTrash: () => request<{ tasks: number; projects: number }>(`${base}/trash`, { method: 'DELETE' }),
}

/** Dage til deadline (negativ = overskredet). */
export function daysLeft(deadline: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = deadline.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
}

export function deadlineLabel(deadline: string) {
  const n = daysLeft(deadline)
  if (n < 0) return `${-n} ${n === -1 ? 'dag' : 'dage'} over`
  if (n === 0) return 'I dag'
  if (n === 1) return 'I morgen'
  return `Om ${n} dage`
}

export const deadlineClass = (deadline: string) => {
  const n = daysLeft(deadline)
  return n < 0 ? 'bg-red-50 text-red-700' : n <= 2 ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-600'
}
