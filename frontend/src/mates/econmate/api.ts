import { json, request } from '../../api'

export type EventType = 'budget' | 'project'

export interface EconEvent {
  id: number
  name: string
  event_type: EventType
  start_date: string | null
  end_date: string | null
  budget_amount: number
  created_at: string
  member_ids: number[]
  total?: number
  monthly_total?: number
}

export interface Expense {
  id: number
  event_id: number
  description: string
  amount: number
  /** null = Fælles (deles ligeligt mellem deltagerne) */
  paid_by: number | null
  category: string | null
  expense_date: string
  payment_frequency: string | null
  payment_method: string | null
}

export interface Settlement {
  id: number
  payer_id: number
  receiver_id: number
  amount: number
  settlement_date: string
}

export interface Summary {
  total: number
  monthly_total: number
  members: { user_id: number; paid: number; monthly: number; balance: number }[]
  categories: { category: string; monthly: number }[]
  transfers: { from: number; to: number; amount: number }[]
}

export interface EventDetail {
  event: EconEvent
  expenses: Expense[]
  settlements: Settlement[]
  summary: Summary
}

export type EventInput = Pick<EconEvent, 'name' | 'event_type' | 'start_date' | 'end_date' | 'budget_amount' | 'member_ids'>
export type ExpenseInput = Omit<Expense, 'id' | 'event_id'>

const base = '/econmate'

export const econApi = {
  meta: () => request<{ frequencies: string[]; payment_methods: string[]; categories: string[] }>(`${base}/meta`),
  events: () => request<EconEvent[]>(`${base}/events`),
  event: (id: number) => request<EventDetail>(`${base}/events/${id}`),
  createEvent: (body: EventInput) => request<EconEvent>(`${base}/events`, json('POST', body)),
  updateEvent: (id: number, body: EventInput) => request<EconEvent>(`${base}/events/${id}`, json('PUT', body)),
  deleteEvent: (id: number) => request(`${base}/events/${id}`, { method: 'DELETE' }),
  createExpense: (eventId: number, body: ExpenseInput) => request<Expense>(`${base}/events/${eventId}/expenses`, json('POST', body)),
  updateExpense: (id: number, body: ExpenseInput) => request<Expense>(`${base}/expenses/${id}`, json('PUT', body)),
  deleteExpense: (id: number) => request(`${base}/expenses/${id}`, { method: 'DELETE' }),
  createSettlement: (eventId: number, body: { payer_id: number; receiver_id: number; amount: number; settlement_date?: string }) =>
    request<Settlement>(`${base}/events/${eventId}/settlements`, json('POST', body)),
  deleteSettlement: (id: number) => request(`${base}/settlements/${id}`, { method: 'DELETE' }),
}
