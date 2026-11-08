/**
 * Registret over alle mates i hubben. Hubbens forside og topbaren bygges herfra.
 * Ny mate: tilføj en indgang her, en mappe under src/mates/<id>/ med routes.ts,
 * og et Elysia-plugin under backend/src/mates/<id>/ med præfikset /<id>.
 */

/** Domus er sit eget projekt (Python/FastAPI) med egen docker compose – ikke en mate-plugin i denne hub. */
const DOMUS_URL = import.meta.env.VITE_DOMUS_URL ?? 'http://localhost:8181'
export interface MateInfo {
  id: string
  name: string
  icon: string
  description: string
  /** RGB-værdier til accentfarven, fx '4 120 87'. */
  accent: string
  accentSoft: string
  /** 'ready' = findes i hubben; 'planned' = vises som kommende. */
  status: 'ready' | 'planned'
  /** Sat for mates, der er egne apps uden for hubben – kortet linker eksternt i stedet for til en intern rute. */
  href?: string
}

export const MATES: MateInfo[] = [
  {
    id: 'stockmate',
    name: 'Stockmate',
    icon: '📈',
    description: 'Porteføljetracker med kurser fra Yahoo Finance, depoter, transaktioner og realiseret/urealiseret gevinst.',
    accent: '4 120 87',
    accentSoft: '236 253 245',
    status: 'ready',
  },
  {
    id: 'econmate',
    name: 'Econmate',
    icon: '💰',
    description: 'Faste budgetter pr. måned og projekter med udlæg, der udlignes mellem deltagerne.',
    accent: '180 83 9',
    accentSoft: '255 251 235',
    status: 'ready',
  },
  {
    id: 'foodmate',
    name: 'Foodmate',
    icon: '🍽️',
    description: 'Opskrifter og kalorieberegning pr. portion.',
    accent: '194 65 12',
    accentSoft: '255 247 237',
    status: 'planned',
  },
  {
    id: 'kinmate',
    name: 'Kinmate',
    icon: '🌳',
    description: 'Slægtsforskning: familietræ, anecirkel, kort, tidslinje, kilder, forskningslog, datakvalitet og GEDCOM.',
    accent: '15 118 110',
    accentSoft: '240 253 250',
    status: 'ready',
  },
  {
    id: 'diskmate',
    name: 'DiskMate',
    icon: '🥏',
    description: 'Disc golf: UDisc-import, statistik pr. bane, layout og hul, spillere, badges, grupperunder og diskkartotek.',
    accent: '79 70 229',
    accentSoft: '238 242 255',
    status: 'ready',
  },
  {
    id: 'kanmate',
    name: 'KanMate',
    icon: '📋',
    description: 'Familiens kanban: projekter, opgaver med deadlines, prioritet og underopgaver, arkiv og papirkurv.',
    accent: '29 78 216',
    accentSoft: '239 246 255',
    status: 'ready',
  },
  {
    id: 'contactmate',
    name: 'ContactMate',
    icon: '📇',
    description: 'Kontakter med Google-sync, dublet-oprydning, LinkedIn-berigelse og Gmail-baseret "sidst kontaktet".',
    accent: '190 24 93',
    accentSoft: '255 241 242',
    status: 'ready',
  },
  {
    id: 'domus',
    name: 'Domus',
    icon: '🏠',
    description: 'Hjemmets teknik: router og AiMesh, klienter, WiFi-kanaler, hændelser og gulvvarme (Roth Touchline).',
    accent: '15 118 110',
    accentSoft: '240 253 250',
    status: 'ready',
    href: DOMUS_URL,
  },
]

export const findMate = (id: string | undefined) => MATES.find(m => m.id === id)
