export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Fælles fetch-hjælper for hubben og alle mates. Serverens fejlbesked vises, hvis der er en. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Kan ikke få forbindelse til serveren')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? `Serverfejl (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export interface User {
  id: number
  username: string
  created_at: string
}

export const hubApi = {
  listUsers: () => request<User[]>('/users'),
  createUser: (username: string) => request<User>('/users', json('POST', { username })),
}
