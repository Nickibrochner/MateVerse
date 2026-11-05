import { API_URL, json, request } from '../../api'

export interface Person {
  id: string
  navn: string
  fødselsdato: string | null
  fødselsogn: string | null
  dødsdato: string | null
  dødssogn: string | null
  køn: string | null
  noter: string | null
  /** Filnavn på serveren – hentes via billedeUrl(). */
  billede: string | null
}

export interface Relation {
  id: string
  person1_id: string
  person1_navn: string
  person2_id: string
  person2_navn: string
  type_: string
  start_dato: string | null
  slut_dato: string | null
  noter: string | null
}

export interface Kilde {
  id: string
  titel: string
  type_: string | null
  arkiv_reference: string | null
  url: string | null
  noter: string | null
  oprettet_at: string
}

export interface KildeKobling {
  id: string
  kilde_id: string
  kilde_titel: string
  person_id: string | null
  relation_id: string | null
  felt: string | null
  sikkerhed: string | null
  noter: string | null
}

export interface Forskningsopgave {
  id: string
  person_id: string
  beskrivelse: string
  status: string
  oprettet_at: string
  løst_at: string | null
}

export interface Sted {
  id: string
  navn: string
  lat: number | null
  lng: number | null
  kilde: string | null
}

export interface Duplicate {
  id1: string
  type1: string
  id2: string
  type2: string
  person1_navn: string
  person2_navn: string
  gruppe: string
}

export interface RelationForslag {
  person1_id: string
  person1_navn: string
  person2_id: string
  person2_navn: string
  type_: string
  begrundelse: string
}

export type PersonInput = Pick<Person, 'navn' | 'fødselsdato' | 'fødselsogn' | 'dødsdato' | 'dødssogn' | 'køn' | 'noter'>
export type RelationInput = Pick<Relation, 'person1_id' | 'person2_id' | 'type_' | 'start_dato' | 'slut_dato' | 'noter'>
export type KildeInput = Pick<Kilde, 'titel' | 'type_' | 'arkiv_reference' | 'url' | 'noter'>

export interface KinData {
  persons: Person[]
  relations: Relation[]
  kilder: Kilde[]
  kilde_koblinger: KildeKobling[]
  forskningsopgaver: Forskningsopgave[]
  steder: Sted[]
}

const base = '/kinmate'

/** URL til personens billede; filnavnet skifter ved nyt billede, så cachen ikke snyder. */
export const billedeUrl = (p: Pick<Person, 'id' | 'billede'>) =>
  p.billede ? `${API_URL}${base}/persons/${p.id}/billede?v=${encodeURIComponent(p.billede)}` : null

export const kinApi = {
  data: () => request<KinData>(`${base}/data`),
  createPerson: (body: PersonInput) => request<Person>(`${base}/persons`, json('POST', body)),
  updatePerson: (id: string, body: PersonInput) => request<Person>(`${base}/persons/${id}`, json('PUT', body)),
  deletePerson: (id: string) => request(`${base}/persons/${id}`, { method: 'DELETE' }),
  setBillede: (id: string, image: string | null) => request<Person>(`${base}/persons/${id}/billede`, json('PUT', { image })),
  prompt: (id: string) => request<{ prompt: string }>(`${base}/persons/${id}/prompt`),
  merge: (keep_id: string, remove_id: string) => request(`${base}/persons/merge`, json('POST', { keep_id, remove_id })),
  createRelation: (body: RelationInput) => request<{ id: string }>(`${base}/relations`, json('POST', body)),
  updateRelation: (id: string, body: RelationInput) => request(`${base}/relations/${id}`, json('PUT', body)),
  deleteRelation: (id: string) => request(`${base}/relations/${id}`, { method: 'DELETE' }),
  dubletter: () => request<Duplicate[]>(`${base}/dubletter`),
  forslag: () => request<RelationForslag[]>(`${base}/forslag`),
  createKilde: (body: KildeInput) => request<{ id: string }>(`${base}/kilder`, json('POST', body)),
  updateKilde: (id: string, body: KildeInput) => request(`${base}/kilder/${id}`, json('PUT', body)),
  deleteKilde: (id: string) => request(`${base}/kilder/${id}`, { method: 'DELETE' }),
  linkKilde: (body: { kilde_id: string; person_id?: string | null; relation_id?: string | null; felt?: string | null; sikkerhed?: string | null; noter?: string | null }) =>
    request<{ id: string }>(`${base}/koblinger`, json('POST', body)),
  unlinkKilde: (id: string) => request(`${base}/koblinger/${id}`, { method: 'DELETE' }),
  createOpgave: (person_id: string, beskrivelse: string) => request<{ id: string }>(`${base}/opgaver`, json('POST', { person_id, beskrivelse })),
  setOpgaveStatus: (id: string, status: string) => request(`${base}/opgaver/${id}/status`, json('PUT', { status })),
  deleteOpgave: (id: string) => request(`${base}/opgaver/${id}`, { method: 'DELETE' }),
  setStedKoordinater: (navn: string, lat: number, lng: number) => request<Sted>(`${base}/steder`, json('PUT', { navn, lat, lng })),
  geocode: (navn: string) => request<Sted>(`${base}/steder/geocode`, json('POST', { navn })),
  importGedcom: (content: string) =>
    request<{ personer: number; relationer: number; advarsler: string[] }>(`${base}/gedcom`, json('POST', { content })),
  gedcomUrl: () => `${API_URL}${base}/gedcom`,
  backup: () => request<unknown>(`${base}/backup`),
  restore: (data: unknown) => request<{ personer: number; relationer: number }>(`${base}/backup`, json('POST', data)),
}
