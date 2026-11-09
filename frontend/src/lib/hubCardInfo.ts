import { request } from '../api'
import { stockmateApi } from '../mates/stockmate/api'
import { econApi } from '../mates/econmate/api'
import { kanApi, daysLeft } from '../mates/kanmate/api'
import { catApi, sidenTekst } from '../mates/catmate/api'
import { money, signed, today } from './format'

/**
 * Valgbare "ekstra info"-linjer til hub-kortene (se Settings.vue og Hub.vue). Hver mate har et
 * par lette nøgletal, bygget på endpoints der allerede findes til mate'ens egne sider – ingen af
 * dem henter mere data, end mate'en selv ville have gjort.
 */
export interface HubInfoOption {
  id: string
  label: string
  /** Returnerer teksten til kortet, eller null hvis der ikke er noget nævneværdigt at vise endnu. */
  fetch(): Promise<string | null>
}

interface DiskmateCourseStat {
  course_id: number
  rounds_played: number
}

async function diskmateCourseStats(): Promise<DiskmateCourseStat[]> {
  const { result } = await request<{ result: DiskmateCourseStat[] }>('/diskmate/rpc/get_course_stats', {
    method: 'POST',
    body: JSON.stringify({ playerName: null }),
  })
  return result
}

interface KinmateSummary {
  persons: number
  open_tasks: number
}

export const HUB_INFO_OPTIONS: Record<string, HubInfoOption[]> = {
  stockmate: [
    {
      id: 'value',
      label: 'Samlet værdi',
      async fetch() {
        const rows = await stockmateApi.overview()
        if (!rows.length) return null
        const value = rows.reduce((a, r) => a + r.value_dkk, 0)
        const unrealized = rows.reduce((a, r) => a + r.unrealized_dkk, 0)
        return `Samlet værdi ${money(value)} (${signed(unrealized)})`
      },
    },
    {
      id: 'positions',
      label: 'Åbne positioner',
      async fetch() {
        const rows = await stockmateApi.overview()
        const n = rows.reduce((a, r) => a + r.positions, 0)
        return n ? `${n} ${n === 1 ? 'position' : 'positioner'}` : null
      },
    },
  ],

  econmate: [
    {
      id: 'monthly',
      label: 'Budget pr. måned',
      async fetch() {
        const events = await econApi.events()
        const total = events.filter(e => e.event_type === 'budget').reduce((a, e) => a + (e.monthly_total ?? 0), 0)
        return total ? `${money(total)} / måned` : null
      },
    },
    {
      id: 'events',
      label: 'Aktive begivenheder',
      async fetch() {
        const events = await econApi.events()
        return events.length ? `${events.length} ${events.length === 1 ? 'begivenhed' : 'begivenheder'}` : null
      },
    },
  ],

  kanmate: [
    {
      id: 'open',
      label: 'Åbne opgaver',
      async fetch() {
        const tasks = await kanApi.tasks()
        const open = tasks.filter(t => t.column_name !== 'done').length
        return open ? `${open} ${open === 1 ? 'åben opgave' : 'åbne opgaver'}` : null
      },
    },
    {
      id: 'overdue',
      label: 'Overskredne deadlines',
      async fetch() {
        const tasks = await kanApi.tasks()
        const overdue = tasks.filter(t => t.deadline && t.column_name !== 'done' && daysLeft(t.deadline) < 0).length
        return overdue ? `${overdue} ${overdue === 1 ? 'overskredet deadline' : 'overskredne deadlines'}` : null
      },
    },
  ],

  diskmate: [
    {
      id: 'rounds',
      label: 'Registrerede runder',
      async fetch() {
        const rows = await diskmateCourseStats()
        const n = rows.reduce((a, r) => a + r.rounds_played, 0)
        return n ? `${n} ${n === 1 ? 'runde' : 'runder'} registreret` : null
      },
    },
    {
      id: 'courses',
      label: 'Baner spillet',
      async fetch() {
        const rows = await diskmateCourseStats()
        const n = new Set(rows.filter(r => r.rounds_played > 0).map(r => r.course_id)).size
        return n ? `${n} ${n === 1 ? 'bane' : 'baner'} spillet` : null
      },
    },
  ],

  '500mate': [
    {
      id: 'games',
      label: 'Spil i alt',
      async fetch() {
        const games = await request<{ id: number }[]>('/500mate/games')
        return games.length ? `${games.length} ${games.length === 1 ? 'spil' : 'spil'} registreret` : null
      },
    },
    {
      id: 'leader',
      label: 'Topscore',
      async fetch() {
        const board = await request<{ navn: string; sejre: number }[]>('/500mate/leaderboard')
        const leder = [...board].filter(r => r.sejre > 0).sort((a, b) => b.sejre - a.sejre)[0]
        return leder ? `${leder.navn} fører med ${leder.sejre} ${leder.sejre === 1 ? 'sejr' : 'sejre'}` : null
      },
    },
  ],

  foodmate: [
    {
      id: 'recipes',
      label: 'Opskrifter i alt',
      async fetch() {
        const recipes = await request<{ id: number }[]>('/foodmate/recipes')
        return recipes.length ? `${recipes.length} ${recipes.length === 1 ? 'opskrift' : 'opskrifter'}` : null
      },
    },
    {
      id: 'ingredients',
      label: 'Ingredienser i kartoteket',
      async fetch() {
        const ingredients = await request<{ id: number }[]>('/foodmate/ingredients')
        return ingredients.length ? `${ingredients.length} ${ingredients.length === 1 ? 'ingrediens' : 'ingredienser'}` : null
      },
    },
    {
      id: 'kcal_today',
      label: 'Spist i dag (kcal)',
      async fetch() {
        const { total } = await request<{ total: { energi_kcal: number | null } }>(`/foodmate/log?dato=${today()}`)
        return total.energi_kcal != null ? `${Math.round(total.energi_kcal)} kcal i dag` : null
      },
    },
  ],

  catmate: [
    {
      id: 'seen',
      label: 'Sidst set',
      async fetch() {
        const pets = await catApi.pets()
        const p = pets.find(x => x.position)
        return p?.position ? `${p.navn} set ${sidenTekst(p.position.time)}` : null
      },
    },
    {
      id: 'battery',
      label: 'Batteri',
      async fetch() {
        const pets = await catApi.pets()
        const p = pets.find(x => x.batteri != null)
        return p ? `${p.navn}: ${p.batteri} % batteri` : null
      },
    },
  ],

  contactmate: [
    {
      id: 'contacts',
      label: 'Kontakter i alt',
      async fetch() {
        const contacts = await request<{ id: string }[]>('/contactmate/contacts')
        return contacts.length ? `${contacts.length} ${contacts.length === 1 ? 'kontakt' : 'kontakter'}` : null
      },
    },
    {
      id: 'duplicates',
      label: 'Mulige dubletter',
      async fetch() {
        const { pairs } = await request<{ pairs: unknown[] }>('/contactmate/duplicates')
        return pairs.length ? `${pairs.length} ${pairs.length === 1 ? 'mulig dublet' : 'mulige dubletter'}` : null
      },
    },
  ],

  kinmate: [
    {
      id: 'persons',
      label: 'Personer i træet',
      async fetch() {
        const { persons } = await request<KinmateSummary>('/kinmate/summary')
        return persons ? `${persons} ${persons === 1 ? 'person' : 'personer'} i træet` : null
      },
    },
    {
      id: 'tasks',
      label: 'Åbne forskningsopgaver',
      async fetch() {
        const { open_tasks } = await request<KinmateSummary>('/kinmate/summary')
        return open_tasks ? `${open_tasks} ${open_tasks === 1 ? 'åben forskningsopgave' : 'åbne forskningsopgaver'}` : null
      },
    },
  ],
}
