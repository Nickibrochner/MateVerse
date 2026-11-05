export interface ImportSummary {
  imported_rounds: number
  skipped_duplicates: number
}

export interface CourseStat {
  course_id: number
  course_name: string
  layout_id: number
  layout_name: string
  hole_count: number
  rounds_played: number
  avg_to_par: number
  best_to_par: number
  worst_to_par: number
}

export interface HoleStat {
  hole_number: number
  par: number
  times_played: number
  avg_strokes: number
  avg_to_par: number
}

export interface HistoryPoint {
  round_id: number
  date: string
  to_par: number
  total_score: number
}

export interface CourseHole {
  id: number
  course_id: number
  label: string
}

export interface LayoutHole {
  hole_number: number
  par: number
  course_hole_id: number | null
  course_hole_label: string | null
}

export interface CourseHoleStat {
  course_hole_id: number
  label: string
  times_played: number
  avg_strokes: number
  avg_to_par: number
  layouts: string[]
}

export interface CourseHoleHistoryPoint {
  date: string
  strokes: number
  to_par: number
  layout_name: string
}

export interface PlayerSummary {
  rounds_played: number
  avg_to_par: number
  best_to_par: number
  worst_to_par: number
  avg_rating: number | null
  first_round_date: string | null
  last_round_date: string | null
}

export interface PlayerRound {
  round_id: number
  layout_id: number
  date: string
  course_name: string
  layout_name: string
  total_score: number
  to_par: number
  rating: number | null
}

export interface Session {
  layout_id: number
  course_name: string
  layout_name: string
  date: string
  player_count: number
}

export interface SessionPlayerResult {
  player_name: string
  total_score: number
  to_par: number
  rating: number | null
  placement: number
}

export interface SessionDetail {
  course_name: string
  layout_name: string
  date: string
  results: SessionPlayerResult[]
}

export interface HeadToHeadRound {
  date: string
  course_name: string
  layout_name: string
  a_to_par: number
  b_to_par: number
  winner: string | null
}

export interface HeadToHead {
  player_a: string
  player_b: string
  a_wins: number
  b_wins: number
  ties: number
  rounds: HeadToHeadRound[]
}

export interface Badge {
  id: string
  category: string
  icon: string
  label: string
  description: string
  achieved: boolean
  progress: number
  target: number
}

export interface PersonalBest {
  to_par: number
  date: string
  course_name: string
  layout_name: string
}

export interface BadgeBoard {
  badges: Badge[]
  personal_best: PersonalBest | null
}

export interface Disc {
  id: number
  name: string
  brand: string | null
  mold: string | null
  category: string
  color: string | null
  in_bag: boolean
  speed: number | null
  glide: number | null
  turn: number | null
  fade: number | null
  weight_grams: number | null
  plastic: string | null
  condition: string | null
  notes: string | null
  image_path: string | null
  holder: string | null
  lost: boolean
  skill_levels: string[]
  best_wind: string | null
  best_weather: string | null
  stability: string | null
  acquired_date: string | null
}

export interface DiscInput {
  name: string
  brand: string | null
  mold: string | null
  category: string
  color: string | null
  in_bag: boolean
  speed: number | null
  glide: number | null
  turn: number | null
  fade: number | null
  weight_grams: number | null
  plastic: string | null
  condition: string | null
  notes: string | null
  holder: string | null
  lost: boolean
  skill_levels: string[]
  best_wind: string | null
  best_weather: string | null
  stability: string | null
  acquired_date: string | null
}

export const SKILL_LEVELS = ['Begynder', 'Øvet', 'Erfaren', 'Mester'] as const
export const DISC_CATEGORIES = ['Driver', 'Midrange', 'Putter', 'Approach', 'Andet']
export const DISC_STABILITY = ['Overstabil', 'Stabil', 'Understabil'] as const

export interface RoundConditions {
  wind: string | null
  weather: string | null
}

export interface RoundTotals {
  total_score: number
  total_par: number
  to_par: number
}

export interface RoundHoleDetail {
  hole_number: number
  strokes: number
  par: number
  to_par: number
  course_hole_label: string | null
}

export interface DriveStatus {
  has_client_credentials: boolean
  connected: boolean
  folder_id: string | null
  folder_name: string | null
}

export interface AutoImportFileResult {
  file_name: string
  imported_rounds: number
  skipped_duplicates: number
}

export interface AutoImportError {
  file_name: string
  message: string
}

export interface AutoImportSummary {
  folder: string | null
  files_processed: AutoImportFileResult[]
  errors: AutoImportError[]
}
