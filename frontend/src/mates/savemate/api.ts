import { json, request } from '../../api'

export type GoalStatus = 'reached' | 'on_track' | 'behind' | 'overdue'

export const STATUS: Record<GoalStatus, { label: string; class: string }> = {
  reached: { label: 'Nået', class: 'bg-emerald-50 text-emerald-700' },
  on_track: { label: 'På sporet', class: 'bg-accent-soft text-accent' },
  behind: { label: 'Bagud', class: 'bg-amber-50 text-amber-700' },
  overdue: { label: 'Dato passeret', class: 'bg-red-50 text-red-700' },
}

export const ICONS = ['🎯', '🏖️', '🚗', '🏠', '🎓', '💍', '🎁', '🛠️', '✈️', '🐶', '💻', '🛟']

export interface Goal {
  id: number
  name: string
  target_amount: number
  target_date: string
  owner_id: number | null
  icon: string
  saved: number
  remaining: number
  progress: number
  months_left: number
  monthly_needed: number
  recent_monthly: number
  status: GoalStatus
}

export interface Contribution {
  id: number
  goal_id: number | null
  amount: number
  contribution_date: string
  description: string | null
  is_lump_sum: boolean
}

export type GoalInput = Pick<Goal, 'name' | 'target_amount' | 'target_date' | 'owner_id' | 'icon'>
export type ContributionInput = Omit<Contribution, 'id'>

const base = '/savemate'

export const saveApi = {
  overview: () => request<{
    goals: Goal[]
    general_lump_sums: Contribution[]
    totals: { target: number; saved: number; general: number; monthly_needed: number }
  }>(`${base}/overview`),
  goal: (id: number) => request<{ goal: Goal; contributions: Contribution[] }>(`${base}/goals/${id}`),
  createGoal: (body: GoalInput) => request<Goal>(`${base}/goals`, json('POST', body)),
  updateGoal: (id: number, body: GoalInput) => request<Goal>(`${base}/goals/${id}`, json('PUT', body)),
  deleteGoal: (id: number) => request(`${base}/goals/${id}`, { method: 'DELETE' }),
  createContribution: (body: ContributionInput) => request<Contribution>(`${base}/contributions`, json('POST', body)),
  updateContribution: (id: number, body: ContributionInput) => request<Contribution>(`${base}/contributions/${id}`, json('PUT', body)),
  deleteContribution: (id: number) => request(`${base}/contributions/${id}`, { method: 'DELETE' }),
}
