<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import KinPage from '../components/KinPage.vue'
import PersonPicker from '../components/PersonPicker.vue'
import { useKinStore } from '../store'
import {
  forælderTyper as forælder_typer,
  barnTyper as barn_typer,
  partnerTyper as partner_typer,
  søskendeTyper as søskende_typer,
  reneSøskendeTyper as rene_søskende_typer,
} from '../relationTypes'


// ═══════════ TYPES ═══════════

interface Person {
  id: string
  navn: string
  fødselsdato: string | null
  dødsdato: string | null
  køn: string | null
  noter: string | null
}
interface Relation {
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

type Rolle =
  | 'selected'
  | 'partner'
  | 'sibling'
  | 'sibling-partner'
  | 'partner-sibling'
  | 'partner-sibling-partner'
  | 'cousin'
  | 'cousin-partner'
  | 'aunt-uncle'
  | 'aunt-uncle-partner'
  | 'ancestor'
  | 'descendant'

interface RowItem {
  id: string
  role: Rolle
}

interface TreeNode {
  id: string
  navn: string
  x: number
  y: number
  role: Rolle
  subLinje1: string
  subLinje2: string
  isDød: boolean
}

interface PartnerEdge {
  x1: number; y1: number; x2: number; y2: number
}

// Data kommer fra Kinmates store i stedet for props (layoutkoden nedenfor er uændret fra Tauri-udgaven)
const store = useKinStore()
const props = {
  get persons(): Person[] { return store.persons },
  get relations(): Relation[] { return store.relations },
}

// Dobbeltklik åbner personens side
const router = useRouter()
const emit = (_e: 'åbnPerson', id: string) => router.push(`/kinmate/personer/${id}`)


// ═══════════ KONSTANTER ═══════════

const NODE_W = 140
const NODE_H = 68
const V_GAP = 60
const H_GAP = 30
const PARTNER_GAP_INNER = 14  // mellem partner-par
const UNIT_GAP_OUTER = 26     // mellem units
const MAX_DEPTH = 20

// ═══════════ NAVIGATION ═══════════

const historik = ref<string[]>([])
const selectedPersonId = ref<string | null>(null)

// Autocomplete-søger til startskærm
const startSøg   = ref('')
const startÅben  = ref(false)
const startForslag = computed(() => {
  const q = startSøg.value.trim().toLowerCase()
  if (!q) return props.persons.slice(0, 8)
  return props.persons.filter(p => p.navn.toLowerCase().includes(q)).slice(0, 10)
})

function vælgStartPerson(id: string) {
  selectedPersonId.value = id
  startSøg.value  = ''
  startÅben.value = false
}

function lukkEfterKort(fn: () => void) { window.setTimeout(fn, 150) }

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') rydSti()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function vælgPerson(id: string) {
  if (selectedPersonId.value && selectedPersonId.value !== id) {
    historik.value.push(selectedPersonId.value)
  }
  selectedPersonId.value = id
}

/** PersonPicker arbejder med '' som "ingen"; træet med null. */
const valgtIPicker = computed({
  get: () => selectedPersonId.value ?? '',
  set: (id: string) => { if (id) vælgPerson(id) },
})

function gåTilbage() {
  const prev = historik.value.pop()
  if (prev) selectedPersonId.value = prev
}

// ═══════════ LOOKUPS ═══════════

function personById(id: string): Person | undefined {
  return props.persons.find(p => p.id === id)
}

function findForældreIdsAf(barnId: string): string[] {
  const set = new Set<string>()
  for (const r of props.relations) {
    if (r.person2_id === barnId && forælder_typer.has(r.type_)) set.add(r.person1_id)
    else if (r.person1_id === barnId && barn_typer.has(r.type_)) set.add(r.person2_id)
  }
  return [...set]
}

function findBørnIdsAf(forælderId: string): string[] {
  const set = new Set<string>()
  for (const r of props.relations) {
    if (r.person1_id === forælderId && forælder_typer.has(r.type_)) set.add(r.person2_id)
    else if (r.person2_id === forælderId && barn_typer.has(r.type_)) set.add(r.person1_id)
  }
  return [...set]
}

function findPartnereIdsAf(personId: string): string[] {
  const set = new Set<string>()
  for (const r of props.relations) {
    if (!partner_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

function findSøskendeIdsAf(personId: string): string[] {
  const set = new Set<string>()
  for (const r of props.relations) {
    if (!søskende_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

function findRensSøskendeIdsAf(personId: string): string[] {
  const set = new Set<string>()
  for (const r of props.relations) {
    if (!rene_søskende_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

function findFætreKusinerIds(): string[] {
  const selId = selectedPersonId.value
  if (!selId) return []
  const set = new Set<string>()
  for (const f of findForældreIdsAf(selId)) {
    for (const søsk of findRensSøskendeIdsAf(f)) {
      for (const barn of findBørnIdsAf(søsk)) {
        set.add(barn)
      }
    }
  }
  set.delete(selId)
  return [...set]
}

// ═══════════ BFS OVER GENERATIONER ═══════════

const ancestorGens = computed<string[][]>(() => {
  const selId = selectedPersonId.value
  if (!selId) return []
  const result: string[][] = []
  // Seed inkluderer selected + partnere, så selecteds svigerforældre også
  // flyder op via deres egne forældre.
  const seed = [selId, ...findPartnereIdsAf(selId)]
  const visited = new Set<string>(seed)
  let current = [...seed]

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const next = new Set<string>()
    for (const id of current) {
      for (const pid of findForældreIdsAf(id)) {
        if (!visited.has(pid)) {
          next.add(pid)
          visited.add(pid)
        }
      }
    }
    if (next.size === 0) break
    result.push([...next])
    current = [...next]
  }
  return result
})

const descendantGens = computed<string[][]>(() => {
  const selId = selectedPersonId.value
  if (!selId) return []
  const result: string[][] = []

  // Seed for descendants: selected + partnere + søskende + partners-søskende + fætre/kusiner.
  // Dvs. alt i gen 0 der kan have børn (nevøer/niecer, fætres børn osv. flyder ned).
  const seed = new Set<string>([selId])
  for (const p of findPartnereIdsAf(selId)) seed.add(p)
  for (const s of findSøskendeIdsAf(selId)) seed.add(s)
  const partners = findPartnereIdsAf(selId)
  for (const p of partners) {
    for (const ps of findSøskendeIdsAf(p)) seed.add(ps)
  }
  // Fætres/kusiners børn skal også flyde ned
  for (const c of findFætreKusinerIds()) seed.add(c)

  const visited = new Set<string>(seed)
  let current = [...seed]

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const next = new Set<string>()
    for (const id of current) {
      for (const cid of findBørnIdsAf(id)) {
        if (!visited.has(cid)) {
          next.add(cid)
          visited.add(cid)
        }
      }
      // Også partnere til børn i næste gen (så svigerbørn dukker op)
    }
    // Efter at have samlet næste gens børn, find deres partnere
    const withPartners = new Set(next)
    for (const nid of next) {
      for (const p of findPartnereIdsAf(nid)) {
        if (!visited.has(p)) {
          withPartners.add(p)
          visited.add(p)
        }
      }
    }
    if (withPartners.size === 0) break
    result.push([...withPartners])
    current = [...withPartners]
  }
  return result
})

// ═══════════ SUBTEXT + DØD ═══════════

function erDød(p: Person): boolean {
  return !!p.dødsdato
}

function formatÅr(p: Person): string {
  const start = p.fødselsdato?.slice(0, 4)
  const slut  = p.dødsdato?.slice(0, 4)
  if (start && slut) return `${start}–${slut}`
  if (start)         return `f. ${start}`
  if (slut)          return `d. ${slut}`
  return ''
}

function beregnAlder(p: Person): string | null {
  if (!p.fødselsdato) return null
  const harMåned = p.fødselsdato.length >= 7
  const slutStr  = p.dødsdato ?? new Date().toISOString().slice(0, 10)
  if (harMåned) {
    const f = new Date(p.fødselsdato)
    const s = new Date(slutStr)
    let age = s.getFullYear() - f.getFullYear()
    if (s.getMonth() < f.getMonth() ||
        (s.getMonth() === f.getMonth() && s.getDate() < f.getDate())) age--
    return `${age} år`
  } else {
    const fÅr = parseInt(p.fødselsdato.slice(0, 4))
    const sÅr = p.dødsdato ? parseInt(p.dødsdato.slice(0, 4)) : new Date().getFullYear()
    return `ca. ${sÅr - fÅr} år`
  }
}

function subtextFor(p: Person, role: Rolle): { linje1: string; linje2: string } {
  const år      = formatÅr(p)
  const alder   = beregnAlder(p)
  const dødMark = erDød(p) ? '✝ ' : ''
  const roleLabel: Partial<Record<Rolle, string>> = {
    'selected':                '',
    'partner':                 'Partner',
    'sibling':                 'Søskende',
    'sibling-partner':         'Søskende partner',
    'partner-sibling':         'Svoger/svigerinde',
    'partner-sibling-partner': 'Partners svoger',
    'cousin':                  'Fætter/kusine',
    'cousin-partner':          'Fætters partner',
    'aunt-uncle':              'Onkel/tante',
    'aunt-uncle-partner':      'Onkels partner',
    'ancestor':                '',
    'descendant':              '',
  }
  const label  = roleLabel[role] ?? ''
  const datoDel = år ? `${dødMark}${år}` : (erDød(p) ? '✝' : '')
  const linje1 = [label, datoDel].filter(Boolean).join(' · ')
  const linje2 = alder ?? ''
  return { linje1, linje2 }
}

// ═══════════ LAYOUT-HELPERS ═══════════

// Generisk rækkelayout der grupperer naboer der er partnere i DB.
// Returnerer noder og pusher partner-edges til den givne liste.
function layoutRowAndPairs(
  items: RowItem[],
  y: number,
  centerX: number,
  partnerEdges: PartnerEdge[]
): TreeNode[] {
  if (items.length === 0) return []
  const itemById = new Map(items.map(it => [it.id, it]))
  const placed = new Set<string>()
  const units: { primary: RowItem; partner?: RowItem }[] = []

  for (const item of items) {
    if (placed.has(item.id)) continue
    const partnerIds = findPartnereIdsAf(item.id)
    const partnerInRow = partnerIds.find(pid =>
      itemById.has(pid) && !placed.has(pid) && pid !== item.id
    )
    units.push({
      primary: item,
      partner: partnerInRow ? itemById.get(partnerInRow)! : undefined,
    })
    placed.add(item.id)
    if (partnerInRow) placed.add(partnerInRow)
  }

  const widths = units.map(u =>
    u.partner ? 2 * NODE_W + PARTNER_GAP_INNER : NODE_W
  )
  const totalW =
    widths.reduce((a, b) => a + b, 0) +
    Math.max(0, units.length - 1) * UNIT_GAP_OUTER
  let cursor = centerX - totalW / 2

  const nodes: TreeNode[] = []
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    const p1 = personById(u.primary.id)
    if (p1) {
      nodes.push({
        id: p1.id, navn: p1.navn,
        x: cursor, y,
        role: u.primary.role,
        subLinje1: subtextFor(p1, u.primary.role).linje1,
          subLinje2: subtextFor(p1, u.primary.role).linje2,
          isDød: erDød(p1),
      })
    }
    if (u.partner) {
      const p2 = personById(u.partner.id)
      if (p2) {
        const px = cursor + NODE_W + PARTNER_GAP_INNER
        nodes.push({
          id: p2.id, navn: p2.navn,
          x: px, y,
          role: u.partner.role,
          subLinje1: subtextFor(p2, u.partner.role).linje1,
          subLinje2: subtextFor(p2, u.partner.role).linje2,
          isDød: erDød(p2),
        })
        partnerEdges.push({
          x1: cursor + NODE_W,
          y1: y + NODE_H / 2,
          x2: px,
          y2: y + NODE_H / 2,
        })
      }
    }
    cursor += widths[i] + UNIT_GAP_OUTER
  }
  return nodes
}

// Center-rækken: selected skal stå centreret på centerX uanset hvor mange
// cousins/siblings der står til venstre.
function buildCenterRow(
  centerY: number,
  centerX: number,
  partnerEdges: PartnerEdge[]
): TreeNode[] {
  const selId = selectedPersonId.value
  if (!selId) return []

  const items: RowItem[] = []
  const placed = new Set<string>()

  const myPartners = findPartnereIdsAf(selId)
  const siblings = findSøskendeIdsAf(selId)
  const cousins = findFætreKusinerIds()

  // 1. Fætre/kusiner + deres partnere (yderst venstre)
  for (const cid of cousins) {
    if (placed.has(cid)) continue
    items.push({ id: cid, role: 'cousin' })
    placed.add(cid)
    const cp = findPartnereIdsAf(cid).find(id => !placed.has(id))
    if (cp && cp !== selId) {
      items.push({ id: cp, role: 'cousin-partner' })
      placed.add(cp)
    }
  }

  // 2. Søskende + deres partnere
  for (const sid of siblings) {
    if (placed.has(sid)) continue
    items.push({ id: sid, role: 'sibling' })
    placed.add(sid)
    const sp = findPartnereIdsAf(sid).find(id => !placed.has(id))
    if (sp && sp !== selId) {
      items.push({ id: sp, role: 'sibling-partner' })
      placed.add(sp)
    }
  }

  // 3. Selected + ALLE partnere tilføjes til items-listen
  items.push({ id: selId, role: 'selected' })
  placed.add(selId)
  for (const pid of myPartners) {
    if (!placed.has(pid)) {
      items.push({ id: pid, role: 'partner' })
      placed.add(pid)
    }
  }

  // 4. Partners søskende fra ALLE partnere (ikke kun første)
  for (const pid of myPartners) {
    for (const psid of findSøskendeIdsAf(pid)) {
      if (placed.has(psid)) continue
      items.push({ id: psid, role: 'partner-sibling' })
      placed.add(psid)
      const psp = findPartnereIdsAf(psid).find(id => !placed.has(id))
      if (psp && psp !== selId) {
        items.push({ id: psp, role: 'partner-sibling-partner' })
        placed.add(psp)
      }
    }
  }

  // ── Byg layout manuelt (selected centreret, alle partnere til højre med streger) ──
  //
  // selected er altid forankret på centerX. Til venstre: cousins + siblings.
  // Til højre: partner1, partner2, ... (alle med PARTNER_GAP_INNER), derefter
  // partner-søskende med UNIT_GAP_OUTER.

  const selBlockIds = new Set([selId, ...myPartners])

  // Venstre-items (alt i items FØR selId og ikke en partner)
  interface Unit { ids: string[]; roles: Rolle[]; width: number }
  const leftUnits: Unit[] = []
  const rightUnits: Unit[] = []

  const selIdx = items.findIndex(it => it.id === selId)

  let li = 0
  while (li < selIdx) {
    const cur = items[li]
    const next = items[li + 1]
    if (
      next && li + 1 < selIdx &&
      !selBlockIds.has(cur.id) && !selBlockIds.has(next.id) &&
      findPartnereIdsAf(cur.id).includes(next.id)
    ) {
      leftUnits.push({
        ids: [cur.id, next.id], roles: [cur.role, next.role],
        width: 2 * NODE_W + PARTNER_GAP_INNER,
      })
      li += 2
    } else {
      leftUnits.push({ ids: [cur.id], roles: [cur.role], width: NODE_W })
      li++
    }
  }

  // Højre-items (partner-søskende — alt EFTER selected+partners-blokken)
  const firstRightIdx = selIdx + 1 + myPartners.length
  let ri = firstRightIdx
  while (ri < items.length) {
    const cur = items[ri]
    const next = items[ri + 1]
    if (
      next &&
      !selBlockIds.has(cur.id) && !selBlockIds.has(next.id) &&
      findPartnereIdsAf(cur.id).includes(next.id)
    ) {
      rightUnits.push({
        ids: [cur.id, next.id], roles: [cur.role, next.role],
        width: 2 * NODE_W + PARTNER_GAP_INNER,
      })
      ri += 2
    } else {
      rightUnits.push({ ids: [cur.id], roles: [cur.role], width: NODE_W })
      ri++
    }
  }

  // Bredde af partner-blokken (selected + alle partnere side om side)
  const numPartners = myPartners.length
  const selBlockW = (1 + numPartners) * NODE_W + numPartners * PARTNER_GAP_INNER

  // selected forankres på centerX
  const selX = centerX - NODE_W / 2
  const leftW = leftUnits.reduce((s, u) => s + u.width + UNIT_GAP_OUTER, 0)

  const nodes: TreeNode[] = []

  // Placer venstre units
  let cursor = selX - leftW
  for (const u of leftUnits) {
    for (let k = 0; k < u.ids.length; k++) {
      const p = personById(u.ids[k])
      if (p) {
        nodes.push({
          id: p.id, navn: p.navn,
          x: cursor + k * (NODE_W + PARTNER_GAP_INNER), y: centerY,
          role: u.roles[k],
          subLinje1: subtextFor(p, u.roles[k]).linje1,
          subLinje2: subtextFor(p, u.roles[k]).linje2,
          isDød: erDød(p),
        })
      }
    }
    if (u.ids.length === 2) {
      partnerEdges.push({
        x1: cursor + NODE_W, y1: centerY + NODE_H / 2,
        x2: cursor + NODE_W + PARTNER_GAP_INNER, y2: centerY + NODE_H / 2,
      })
    }
    cursor += u.width + UNIT_GAP_OUTER
  }

  // Placer selected
  const selPerson = personById(selId)
  if (selPerson) {
    nodes.push({
      id: selPerson.id, navn: selPerson.navn,
      x: selX, y: centerY,
      role: 'selected',
      subLinje1: subtextFor(selPerson, 'selected').linje1,
          subLinje2: subtextFor(selPerson, 'selected').linje2,
      isDød: erDød(selPerson),
    })
  }

  // Placer alle partnere direkte til højre for selected med partner-streger til hver
  let partnerCursor = selX + NODE_W + PARTNER_GAP_INNER
  for (const pid of myPartners) {
    const pp = personById(pid)
    const pItem = items.find(it => it.id === pid)
    if (pp && pItem) {
      nodes.push({
        id: pp.id, navn: pp.navn,
        x: partnerCursor, y: centerY,
        role: pItem.role,
        subLinje1: subtextFor(pp, pItem.role).linje1,
          subLinje2: subtextFor(pp, pItem.role).linje2,
        isDød: erDød(pp),
      })
      partnerEdges.push({
        x1: partnerCursor - PARTNER_GAP_INNER,
        y1: centerY + NODE_H / 2,
        x2: partnerCursor,
        y2: centerY + NODE_H / 2,
      })
      partnerCursor += NODE_W + PARTNER_GAP_INNER
    }
  }

  // Placer højre units (partner-søskende)
  cursor = selX + selBlockW + UNIT_GAP_OUTER
  for (const u of rightUnits) {
    for (let k = 0; k < u.ids.length; k++) {
      const p = personById(u.ids[k])
      if (p) {
        nodes.push({
          id: p.id, navn: p.navn,
          x: cursor + k * (NODE_W + PARTNER_GAP_INNER), y: centerY,
          role: u.roles[k],
          subLinje1: subtextFor(p, u.roles[k]).linje1,
          subLinje2: subtextFor(p, u.roles[k]).linje2,
          isDød: erDød(p),
        })
      }
    }
    if (u.ids.length === 2) {
      partnerEdges.push({
        x1: cursor + NODE_W, y1: centerY + NODE_H / 2,
        x2: cursor + NODE_W + PARTNER_GAP_INNER, y2: centerY + NODE_H / 2,
      })
    }
    cursor += u.width + UNIT_GAP_OUTER
  }

  return nodes
}

// Gen -1: direkte forældre + forælders rene søskende (onkler/tanter) + disses partnere.
// Forældre markeres 'ancestor'; resten 'aunt-uncle' / 'aunt-uncle-partner'.
function buildGen1Items(): RowItem[] {
  const selId = selectedPersonId.value
  if (!selId) return []

  const placed = new Set<string>()
  const items: RowItem[] = []

  // Direkte forældre af selected + partners-forældre (svigerforældre)
  const directAncestors: string[] = [...findForældreIdsAf(selId)]
  for (const p of findPartnereIdsAf(selId)) {
    for (const pf of findForældreIdsAf(p)) {
      if (!directAncestors.includes(pf)) directAncestors.push(pf)
    }
  }

  for (const id of directAncestors) {
    if (!placed.has(id)) {
      items.push({ id, role: 'ancestor' })
      placed.add(id)
    }
  }

  // Onkler/tanter (rene søskende til forældre) + deres partnere.
  // Kun selecteds egne forældres søskende — ikke svigerforældres.
  const selectedsForældre = findForældreIdsAf(selId)
  for (const pid of selectedsForældre) {
    for (const søsk of findRensSøskendeIdsAf(pid)) {
      if (!placed.has(søsk)) {
        items.push({ id: søsk, role: 'aunt-uncle' })
        placed.add(søsk)
        for (const sp of findPartnereIdsAf(søsk)) {
          if (!placed.has(sp)) {
            items.push({ id: sp, role: 'aunt-uncle-partner' })
            placed.add(sp)
          }
        }
      }
    }
  }

  return items
}

// ═══════════ GROUPED DESCENDANT LAYOUT ═══════════
//
// Placerer børn grupperet under deres forældre.
// Hver gruppe centreres under sit forælderpar; grupper skubbes fra hinanden
// hvis de overlapper (men holder altid venstre→højre orden).

function layoutGroupAt(
  items: RowItem[],
  y: number,
  startX: number,
  partnerEdges: PartnerEdge[]
): TreeNode[] {
  const placed = new Set<string>()
  const nodes: TreeNode[] = []
  let cursor = startX
  for (const item of items) {
    if (placed.has(item.id)) continue
    const partnerInList = findPartnereIdsAf(item.id)
      .find(pid => items.some(it => it.id === pid) && !placed.has(pid))
    const p1 = personById(item.id)
    if (p1) {
      nodes.push({
        id: p1.id, navn: p1.navn, x: cursor, y,
        role: item.role,
          subLinje1: subtextFor(p1, item.role).linje1,
          subLinje2: subtextFor(p1, item.role).linje2,
          isDød: erDød(p1),
      })
    }
    placed.add(item.id)
    if (partnerInList) {
      const pItem = items.find(it => it.id === partnerInList)!
      const p2 = personById(partnerInList)
      const px = cursor + NODE_W + PARTNER_GAP_INNER
      if (p2) {
        nodes.push({
          id: p2.id, navn: p2.navn, x: px, y,
          role: pItem.role,
          subLinje1: subtextFor(p2, pItem.role).linje1,
          subLinje2: subtextFor(p2, pItem.role).linje2,
          isDød: erDød(p2),
        })
      }
      partnerEdges.push({ x1: cursor + NODE_W, y1: y + NODE_H / 2, x2: px, y2: y + NODE_H / 2 })
      placed.add(partnerInList)
      cursor = px + NODE_W + UNIT_GAP_OUTER
    } else {
      cursor += NODE_W + UNIT_GAP_OUTER
    }
  }
  return nodes
}

function calcGroupWidth(groupIds: string[]): number {
  const placed = new Set<string>()
  let w = 0; let first = true
  for (const id of groupIds) {
    if (placed.has(id)) continue
    const partnerInGroup = findPartnereIdsAf(id)
      .find(pid => groupIds.includes(pid) && !placed.has(pid))
    if (!first) w += UNIT_GAP_OUTER
    w += partnerInGroup ? 2 * NODE_W + PARTNER_GAP_INNER : NODE_W
    placed.add(id)
    if (partnerInGroup) placed.add(partnerInGroup)
    first = false
  }
  return w
}

function layoutDescendantRow(
  ids: string[],
  parentRow: TreeNode[],
  y: number,
  partnerEdges: PartnerEdge[]
): TreeNode[] {
  if (ids.length === 0) return []
  const GROUP_GAP = UNIT_GAP_OUTER + 28

  // Tildel hvert barn en forælde-nøgle ud fra forældre i parentRow.
  // Partnere til børn uden direkte forældre i rækken får samme nøgle som barnet.
  const idToKey  = new Map<string, string>()
  const keyToCx  = new Map<string, number>()

  for (const id of ids) {
    const pIds = findForældreIdsAf(id)
    const inRow = parentRow.filter(n => pIds.includes(n.id))
    if (inRow.length > 0) {
      const key = inRow.map(p => p.id).sort().join('|')
      idToKey.set(id, key)
      if (!keyToCx.has(key)) {
        const cx = inRow.map(p => p.x + NODE_W / 2)
        keyToCx.set(key, (Math.min(...cx) + Math.max(...cx)) / 2)
      }
    }
  }
  // Anden omgang: partnere arver forældregruppens nøgle
  for (const id of ids) {
    if (idToKey.has(id)) continue
    for (const pid of findPartnereIdsAf(id)) {
      if (idToKey.has(pid)) { idToKey.set(id, idToKey.get(pid)!); break }
    }
    if (!idToKey.has(id)) idToKey.set(id, '__orphan__')
  }

  // Byg grupper og sortér efter forældrenes x-position
  const groupMap = new Map<string, string[]>()
  for (const id of ids) {
    const k = idToKey.get(id) ?? '__orphan__'
    if (!groupMap.has(k)) groupMap.set(k, [])
    groupMap.get(k)!.push(id)
  }

  const sorted = [...groupMap.entries()]
    .sort(([ka], [kb]) => (keyToCx.get(ka) ?? 0) - (keyToCx.get(kb) ?? 0))
    .map(([key, gids]) => ({
      key,
      gids,
      idealCx: keyToCx.get(key) ?? 0,
      width: calcGroupWidth(gids),
    }))

  // Beregn startX for hver gruppe: centrer under forældre, skub højre ved overlap
  const startXs: number[] = []
  let rightEdge = -Infinity
  for (const g of sorted) {
    const idealStart = g.idealCx - g.width / 2
    const startX = Math.max(idealStart, rightEdge)
    startXs.push(startX)
    rightEdge = startX + g.width + GROUP_GAP
  }

  // Render
  const nodes: TreeNode[] = []
  for (let i = 0; i < sorted.length; i++) {
    const { gids } = sorted[i]
    const items: RowItem[] = gids.map(id => ({ id, role: 'descendant' as Rolle }))
    nodes.push(...layoutGroupAt(items, y, startXs[i], partnerEdges))
  }
  return nodes
}



const layout = computed(() => {
  const empty = {
    nodes: [] as TreeNode[],
    familyPaths: [] as { d: string; stil: KantStil }[],
    partnerEdges: [] as PartnerEdge[],
    viewBox: '0 0 800 400',
  }
  const selId = selectedPersonId.value
  if (!selId) return empty

  const ancRows = ancestorGens.value
  const descRows = descendantGens.value
  const centerX = 0
  const rowHeight = NODE_H + V_GAP

  const layoutRows: TreeNode[][] = []
  const partnerEdges: PartnerEdge[] = []

  // Dybe ancestor-gens (gen -2 og dybere) — ancestor-rolle, par-gruppering
  for (let i = ancRows.length - 1; i >= 1; i--) {
    const y = (ancRows.length - 1 - i) * rowHeight
    const items: RowItem[] = ancRows[i].map(id => ({ id, role: 'ancestor' }))
    layoutRows.push(layoutRowAndPairs(items, y, centerX, partnerEdges))
  }

  // Gen -1: forældre + onkel/tante
  let centerY = 0
  if (ancRows.length >= 1) {
    const y = (ancRows.length - 1) * rowHeight
    const gen1 = buildGen1Items()
    layoutRows.push(layoutRowAndPairs(gen1, y, centerX, partnerEdges))
    centerY = ancRows.length * rowHeight
  } else {
    centerY = 0
  }

  // Gen 0: center-rækken (selected centreret)
  layoutRows.push(buildCenterRow(centerY, centerX, partnerEdges))

  // Descendants — grupperet under forældre
  for (let i = 0; i < descRows.length; i++) {
    const y = centerY + (i + 1) * rowHeight
    const parentRow = layoutRows[layoutRows.length - 1]
    layoutRows.push(layoutDescendantRow(descRows[i], parentRow, y, partnerEdges))
  }

  // Saml alle noder
  const nodes = layoutRows.flat()

  // ── Familie-kanter (staggered T-bar pr. forældergruppe) ──
  const familyPaths: { d: string; stil: KantStil }[] = []
  const STAGGER = 10

  function push(d: string, stil: KantStil) {
    familyPaths.push({ d, stil })
  }

  function buildFamilyPaths(parentRow: TreeNode[], childRow: TreeNode[]) {
    if (parentRow.length === 0 || childRow.length === 0) return

    const childToParents = new Map<string, TreeNode[]>()
    for (const child of childRow) {
      const parentIds = findForældreIdsAf(child.id)
      const parentsInRow = parentRow.filter(n => parentIds.includes(n.id))
      if (parentsInRow.length > 0) childToParents.set(child.id, parentsInRow)
    }

    const groups = new Map<string, { parents: TreeNode[]; children: TreeNode[] }>()
    for (const [childId, parents] of childToParents) {
      const key = [...parents.map(p => p.id)].sort().join('|')
      if (!groups.has(key)) groups.set(key, { parents, children: [] })
      const cn = childRow.find(n => n.id === childId)
      if (cn) groups.get(key)!.children.push(cn)
    }
    if (groups.size === 0) return

    const sorted = [...groups.values()].sort((a, b) => {
      const jxA = (Math.min(...a.parents.map(p => p.x)) + Math.max(...a.parents.map(p => p.x + NODE_W))) / 2
      const jxB = (Math.min(...b.parents.map(p => p.x)) + Math.max(...b.parents.map(p => p.x + NODE_W))) / 2
      return jxA - jxB
    })
    const n = sorted.length

    sorted.forEach(({ parents, children }, gi) => {
      // Bestem kant-stil fra første barn → første forælder-relation
      const stil = findKantStil(parents[0].id, children[0].id)

      const parentCx = parents.map(p => p.x + NODE_W / 2)
      const junctionX = (Math.min(...parentCx) + Math.max(...parentCx)) / 2
      const parentBottomY = parents[0].y + NODE_H
      const childTopY    = children[0].y
      const gap = childTopY - parentBottomY
      const junctionY = parentBottomY + gap * 0.38

      const branchY = Math.max(
        junctionY + 6,
        childTopY - STAGGER * (n - gi)
      )

      for (const p of parents) {
        const px = p.x + NODE_W / 2
        push(`M ${px} ${p.y + NODE_H} L ${px} ${junctionY}`, stil)
      }
      if (parents.length > 1) {
        push(`M ${Math.min(...parentCx)} ${junctionY} L ${Math.max(...parentCx)} ${junctionY}`, stil)
      }
      push(`M ${junctionX} ${junctionY} L ${junctionX} ${branchY}`, stil)

      const childCx = children.map(c => c.x + NODE_W / 2)
      push(`M ${Math.min(junctionX, ...childCx)} ${branchY} L ${Math.max(junctionX, ...childCx)} ${branchY}`, stil)

      for (const c of children) {
        push(`M ${c.x + NODE_W / 2} ${branchY} L ${c.x + NODE_W / 2} ${childTopY}`, stil)
      }
    })
  }

  for (let i = 0; i < layoutRows.length - 1; i++) {
    buildFamilyPaths(layoutRows[i], layoutRows[i + 1])
  }

  // ── ViewBox ──
  if (nodes.length === 0) {
    return { ...empty, nodes: [] }
  }
  const minX = Math.min(...nodes.map(n => n.x)) - H_GAP
  const maxX = Math.max(...nodes.map(n => n.x + NODE_W)) + H_GAP
  const minY = Math.min(...nodes.map(n => n.y)) - 20
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H)) + 20
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`

  return { nodes, familyPaths, partnerEdges, viewBox }
})

// ═══════════ ZOOM / PAN ═══════════

const containerRef = ref<HTMLDivElement | null>(null)
const zoom         = ref(1)
const panX         = ref(0)
const panY         = ref(0)
const isDragging   = ref(false)
const lastMouse    = ref({ x: 0, y: 0 })
let   dragDist     = 0

function fitToContainer() {
  const el = containerRef.value
  if (!el || !layout.value.viewBox) return
  const [vbX, vbY, vbW, vbH] = layout.value.viewBox.split(' ').map(Number)
  const { clientWidth: W, clientHeight: H } = el
  const scale = Math.min(W / vbW, H / vbH) * 0.88
  zoom.value  = scale
  panX.value  = W / 2 - (vbX + vbW / 2) * scale
  panY.value  = H / 2 - (vbY + vbH / 2) * scale
}

watch(() => layout.value.viewBox, () => {
  // Small delay so DOM has updated dimensions
  setTimeout(fitToContainer, 30)
})

function onWheel(e: WheelEvent) {
  const factor  = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const newZoom = Math.min(5, Math.max(0.1, zoom.value * factor))
  const rect    = containerRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  panX.value = mx - (mx - panX.value) * (newZoom / zoom.value)
  panY.value = my - (my - panY.value) * (newZoom / zoom.value)
  zoom.value  = newZoom
}

function onMousedown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  dragDist = 0
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMousemove(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - lastMouse.value.x
  const dy = e.clientY - lastMouse.value.y
  dragDist += Math.hypot(dx, dy)
  panX.value += dx
  panY.value += dy
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function stopDrag() { isDragging.value = false }

// ═══════════ STI MELLEM TO PERSONER ═══════════

interface StiTrin { id: string; navn: string; rel: string }

const stiMål    = ref<string | null>(null)
const stiKæde   = ref<StiTrin[]>([])

function findSti(fraId: string, tilId: string): StiTrin[] | null {
  if (fraId === tilId) return []

  // Kun forældre/barn-relationer — ingen sidespring via søskende, partnere osv.
  const tilladteTyper = new Set([...forælder_typer, ...barn_typer])

  const adj = new Map<string, { id: string; navn: string; rel: string }[]>()
  for (const r of props.relations) {
    if (!tilladteTyper.has(r.type_)) continue
    if (!adj.has(r.person1_id)) adj.set(r.person1_id, [])
    if (!adj.has(r.person2_id)) adj.set(r.person2_id, [])
    adj.get(r.person1_id)!.push({ id: r.person2_id, navn: r.person2_navn, rel: r.type_ })
    adj.get(r.person2_id)!.push({ id: r.person1_id, navn: r.person1_navn, rel: r.type_ })
  }

  // BFS
  const visited = new Set<string>([fraId])
  const queue: { id: string; path: StiTrin[] }[] = [{ id: fraId, path: [] }]

  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    for (const nb of adj.get(id) ?? []) {
      if (visited.has(nb.id)) continue
      visited.add(nb.id)
      const newPath = [...path, nb]
      if (nb.id === tilId) return newPath
      queue.push({ id: nb.id, path: newPath })
    }
  }
  return null
}

function rydSti() {
  stiMål.value  = null
  stiKæde.value = []
}

const stiNodeIds = computed(() => new Set([
  ...(stiKæde.value.length > 0 ? [selectedPersonId.value!] : []),
  ...stiKæde.value.map(t => t.id),
]))

// Tekst-repræsentation af stien
const stiTekst = computed((): string => {
  if (!selectedPersonId.value || stiKæde.value.length === 0) return ''
  const startNavn = personById(selectedPersonId.value)?.navn ?? ''
  const dele: string[] = [startNavn]
  for (const trin of stiKæde.value) {
    dele.push(`→ ${trin.rel} →`)
    dele.push(trin.navn)
  }
  return dele.join(' ')
})

function onNodeClick(e: MouseEvent, id: string) {
  if (dragDist > 5) return  // var en pan, ikke et klik

  if (e.shiftKey && selectedPersonId.value && selectedPersonId.value !== id) {
    // Shift+klik: find sti fra selected til klikket node
    stiMål.value = id
    const sti = findSti(selectedPersonId.value, id)
    stiKæde.value = sti ?? []
  } else {
    // Normalt klik: naviger + ryd sti
    rydSti()
    vælgPerson(id)
  }
}

function resetView() { fitToContainer() }

// ═══════════ KANT-STYLING ═══════════

interface KantStil { stroke: string; dash: string; width: number }

function kantStilForType(type_: string): KantStil {
  if (['adoptivfar','adoptivmor'].includes(type_))
    return { stroke: '#8b5cf6', dash: '8,4',   width: 2 }
  if (['plejefar','plejemor','plejesøn','plejedatter'].includes(type_))
    return { stroke: '#0891b2', dash: '5,3',   width: 2 }
  if (['stedfar','stedmor','stedsøn','steddatter'].includes(type_))
    return { stroke: '#f97316', dash: '4,3,1,3', width: 2 }
  return { stroke: '#7a8594', dash: '',        width: 1.6 }
}

function findKantStil(parentId: string, childId: string): KantStil {
  const r = props.relations.find(r =>
    (r.person1_id === parentId && r.person2_id === childId &&
      [...forælder_typer].includes(r.type_)) ||
    (r.person1_id === childId && r.person2_id === parentId &&
      [...barn_typer].includes(r.type_))
  )
  return r ? kantStilForType(r.type_) : kantStilForType('far')
}



// Opdel et navn i to linjer så det passer i boksen.
// Første linje max 16 tegn; er der mere end 32 tegn totalt, trunkeres linje 2 med "…".
function navnLinjer(navn: string): [string, string | null] {
  const MAX = 16
  if (navn.length <= MAX) return [navn, null]
  // Find egnet brudpunkt (mellemrum nær midten)
  const midten = Math.floor(navn.length / 2)
  let brud = navn.lastIndexOf(' ', midten + 4)
  if (brud < 2) brud = navn.indexOf(' ', MAX - 4)
  if (brud < 2 || brud > 32) brud = MAX

  const linje1 = navn.slice(0, brud).trimEnd()
  let linje2 = navn.slice(brud).trimStart()
  if (linje2.length > MAX) linje2 = linje2.slice(0, MAX - 1) + '…'
  return [linje1, linje2]
}
</script>

<template>
  <KinPage title="Familietræ" wide>
    <template #actions>
      <div class="w-64"><PersonPicker v-model="valgtIPicker" placeholder="Vælg udgangsperson …" /></div>
      <button v-if="historik.length > 0" type="button" class="btn-secondary" @click="gåTilbage">← Tilbage</button>
    </template>

    <p v-if="!props.persons.length" class="text-stone-500">
      Ingen personer endnu. Opret dem under <router-link to="/kinmate/personer" class="text-accent hover:underline">Personer</router-link>, eller importér en GEDCOM-fil under <router-link to="/kinmate/indstillinger" class="text-accent hover:underline">Indstillinger</router-link>.
    </p>
    <div v-else class="kin-tree">
      <div v-if="!selectedPersonId" class="start-skærm">
        <div class="start-kort">
          <div class="start-ikon">🌳</div>
          <h2 class="start-titel">Hvem vil du se familietræet for?</h2>
          <p class="start-hjælp">Søg på et navn for at komme i gang</p>
          <div class="start-søger">
            <input
              v-model="startSøg"
              placeholder="Skriv et navn…"
              class="start-søg-input"
              autofocus
              @focus="startÅben = true"
              @blur="lukkEfterKort(() => startÅben = false)"
              @keydown.enter="startForslag.length > 0 && vælgStartPerson(startForslag[0].id)"
            />
            <div v-if="startÅben && startForslag.length > 0" class="start-dropdown">
              <div
                v-for="p in startForslag"
                :key="p.id"
                class="start-forslag-item"
                @mousedown.prevent="vælgStartPerson(p.id)"
              >
                <span class="start-forslag-navn">{{ p.navn }}</span>
                <span v-if="p.fødselsdato" class="start-forslag-dato">
                  f. {{ p.fødselsdato.slice(0, 4) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-else
        ref="containerRef"
        class="tree-container"
        @wheel.prevent="onWheel"
        @mousedown="onMousedown"
        @mousemove="onMousemove"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
        :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
      >
        <!-- Zoom-knapper -->
        <div class="zoom-controls">
          <button class="zoom-btn" @click.stop="zoom = Math.min(5, zoom * 1.2)" title="Zoom ind">+</button>
          <button class="zoom-btn" @click.stop="resetView" title="Nulstil visning">⊙</button>
          <button class="zoom-btn" @click.stop="zoom = Math.max(0.1, zoom / 1.2)" title="Zoom ud">−</button>
        </div>

        <!-- Forklaring på kantstile -->
        <div class="kant-legend">
          <span class="legend-item"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#7a8594" stroke-width="2"/></svg> Biologisk</span>
          <span class="legend-item"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="8,4"/></svg> Adoptiv</span>
          <span class="legend-item"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#0891b2" stroke-width="2" stroke-dasharray="5,3"/></svg> Pleje</span>
          <span class="legend-item"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#f97316" stroke-width="2" stroke-dasharray="4,3,1,3"/></svg> Sted</span>
          <span class="legend-item"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#db2777" stroke-width="2" stroke-dasharray="5,4"/></svg> Partner</span>
        </div>

        <!-- Uden viewBox: zoom/pan i fitToContainer() regner i pixels, så SVG'ets koordinater skal også være pixels -->
        <svg class="tree-svg">
          <g :transform="`translate(${panX}, ${panY}) scale(${zoom})`">
            <!-- Partner-edges (pink stiplet) -->
            <line
              v-for="(e, i) in layout.partnerEdges"
              :key="'pe-' + i"
              :x1="e.x1" :y1="e.y1"
              :x2="e.x2" :y2="e.y2"
              stroke="#db2777"
              stroke-width="2"
              stroke-dasharray="5,4"
            />

            <!-- Familie-kanter med farve og dash per relationstype -->
            <path
              v-for="(fp, i) in layout.familyPaths"
              :key="'fp-' + i"
              :d="fp.d"
              fill="none"
              :stroke="fp.stil.stroke"
              :stroke-width="fp.stil.width"
              :stroke-dasharray="fp.stil.dash || undefined"
              stroke-linecap="round"
            />

            <!-- Sti-linjer mellem noder på stien -->
          <g v-if="stiKæde.length > 0">
            <template v-for="(trin, i) in stiKæde" :key="'sti-' + i">
              <template v-if="i === 0">
                <line
                  v-if="layout.nodes.find(n => n.id === selectedPersonId) && layout.nodes.find(n => n.id === trin.id)"
                  :x1="layout.nodes.find(n => n.id === selectedPersonId)!.x + NODE_W / 2"
                  :y1="layout.nodes.find(n => n.id === selectedPersonId)!.y + NODE_H / 2"
                  :x2="layout.nodes.find(n => n.id === trin.id)!.x + NODE_W / 2"
                  :y2="layout.nodes.find(n => n.id === trin.id)!.y + NODE_H / 2"
                  stroke="#22c55e" stroke-width="3" stroke-dasharray="8,5" opacity="0.75"
                />
              </template>
              <template v-if="i > 0">
                <line
                  v-if="layout.nodes.find(n => n.id === stiKæde[i-1].id) && layout.nodes.find(n => n.id === trin.id)"
                  :x1="layout.nodes.find(n => n.id === stiKæde[i-1].id)!.x + NODE_W / 2"
                  :y1="layout.nodes.find(n => n.id === stiKæde[i-1].id)!.y + NODE_H / 2"
                  :x2="layout.nodes.find(n => n.id === trin.id)!.x + NODE_W / 2"
                  :y2="layout.nodes.find(n => n.id === trin.id)!.y + NODE_H / 2"
                  stroke="#22c55e" stroke-width="3" stroke-dasharray="8,5" opacity="0.75"
                />
              </template>
            </template>
          </g>
            <g
              v-for="n in layout.nodes"
              :key="n.id"
              :class="['node', 'role-' + n.role, { 'node-dod': n.isDød, 'node-sti': stiNodeIds.has(n.id) }]"
              :transform="`translate(${n.x}, ${n.y})`"
              @click.stop="onNodeClick($event, n.id)"
              @dblclick.stop="emit('åbnPerson', n.id)"
            >
              <title>{{ n.navn }}{{ n.isDød ? ' (afdød)' : '' }} — dobbeltklik for at åbne i Personer</title>
              <rect
                :width="NODE_W" :height="NODE_H"
                rx="6" ry="6"
                class="node-rect"
                :stroke-dasharray="n.isDød ? '5,3' : 'none'"
              />
              <text v-if="n.isDød" :x="NODE_W - 6" :y="13" text-anchor="end" class="node-kors">✝</text>
              <template v-if="navnLinjer(n.navn)[1]">
                <text :x="NODE_W / 2" :y="17" text-anchor="middle" class="node-navn">{{ navnLinjer(n.navn)[0] }}</text>
                <text :x="NODE_W / 2" :y="31" text-anchor="middle" class="node-navn">{{ navnLinjer(n.navn)[1] }}</text>
              </template>
              <text v-else :x="NODE_W / 2" :y="24" text-anchor="middle" class="node-navn">{{ n.navn }}</text>
              <text v-if="n.subLinje1" :x="NODE_W / 2" :y="48" text-anchor="middle" class="node-sub">{{ n.subLinje1 }}</text>
              <text v-if="n.subLinje2" :x="NODE_W / 2" :y="60" text-anchor="middle" class="node-alder">{{ n.subLinje2 }}</text>
            </g>
          </g>
        </svg>
      </div>
      <!-- Sti-panel -->
      <div v-if="stiMål && stiKæde.length > 0" class="sti-panel">
        <div class="sti-header">
          <span class="sti-label">🔗 Slægtskabssti</span>
          <span class="sti-hop">{{ stiKæde.length }} {{ stiKæde.length === 1 ? 'skridt' : 'skridt' }}</span>
          <button class="sti-luk" @click="rydSti">✕</button>
        </div>
        <div class="sti-tekst">{{ stiTekst }}</div>
      </div>
      <div v-else-if="stiMål && stiKæde.length === 0" class="sti-panel sti-ingen">
        <div class="sti-header">
          <span class="sti-label">🔗 Ingen direkte slægtskabssti</span>
          <button class="sti-luk" @click="rydSti">✕</button>
        </div>
        <div class="sti-tekst">
          Der er ingen direkte forældre/barn-forbindelse mellem de to personer.
        </div>
      </div>
      <div v-else-if="selectedPersonId && !stiMål" class="sti-hint">
        Shift+klik på en anden person for at finde slægtskabsstien
      </div>


    </div>
  </KinPage>
</template>

<style scoped>
/* Stilarket er overtaget fra Tauri-udgaven. Variablerne oversætter dens Fluent-farver til hubbens palet. */
.kin-tree {
  --tree-accent: rgb(var(--accent));
  --tree-accent-subtle: rgb(var(--accent-soft));
  --bg-card: #ffffff;
  --bg-layer: #ffffff;
  --bg-layer-alt: #fafaf9;
  --border: #e7e5e4;
  --border-strong: #d6d3d1;
  --overlay-hover-strong: #f5f5f4;
  --shadow-lg: 0 10px 25px rgb(0 0 0 / 0.12);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --text-primary: #1c1917;
  --text-secondary: #57534e;
  --text-tertiary: #a8a29e;
}
.view { padding: 16px; max-width: 100%; }
.header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
h1 { margin: 0; font-size: 1.4rem; }

.header-actions { display: flex; gap: 8px; align-items: center; }
.person-select {
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-family: inherit; font-size: 0.9rem;
  background: var(--bg-layer);
  color: var(--text-primary);
}

.start-skærm {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 260px);
  min-height: 300px;
}
.start-kort {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  padding: 48px 40px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.start-ikon { font-size: 3rem; }
.start-titel { margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--text-primary); }
.start-hjælp { margin: 0; font-size: 0.9rem; color: var(--text-secondary); }
.start-søger { position: relative; width: 100%; margin-top: 8px; }
.start-søg-input {
  width: 100%;
  padding: 14px 18px;
  font-size: 1.05rem;
  font-family: inherit;
  border: 2px solid var(--border-strong);
  border-radius: 10px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
  background: var(--bg-layer);
  color: var(--text-primary);
}
.start-søg-input:focus { border-color: var(--tree-accent); }
.start-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-layer);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  z-index: 50;
  overflow: hidden;
  text-align: left;
}
.start-forslag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 16px;
  cursor: pointer;
  transition: background 0.1s;
}
.start-forslag-item:hover { background: var(--tree-accent-subtle); }
.start-forslag-item:not(:last-child) { border-bottom: 1px solid var(--border); }
.start-forslag-navn { font-size: 0.95rem; color: var(--text-primary); font-weight: 500; }
.start-forslag-dato { font-size: 0.82rem; color: var(--text-tertiary); }

/* Sti-fremhævning */
.node-sti .node-rect {
  stroke: #22c55e !important;
  stroke-width: 3 !important;
  fill: #f0fdf4 !important;
}
.node-dod.node-sti .node-rect {
  fill: #dcfce7 !important;
}
:root[data-theme="dark"] .node-sti .node-rect { fill: rgba(34,197,94,0.18) !important; }
:root[data-theme="dark"] .node-dod.node-sti .node-rect { fill: rgba(34,197,94,0.28) !important; }

.sti-panel {
  margin-top: 12px;
  padding: 14px 18px;
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 10px;
}
.sti-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.sti-label { font-weight: 700; color: #166534; font-size: 0.9rem; }
.sti-hop {
  background: #22c55e; color: white;
  padding: 1px 8px; border-radius: 10px; font-size: 0.78rem; font-weight: 600;
}
.sti-luk {
  margin-left: auto; background: none; border: none;
  color: #4ade80; cursor: pointer; font-size: 0.95rem; padding: 2px 6px;
  border-radius: 4px;
}
.sti-luk:hover { background: #dcfce7; }
.sti-tekst {
  font-size: 0.9rem; color: #166534; line-height: 1.6;
  word-break: break-word;
}

.sti-panel.sti-ingen {
  background: #fff7ed;
  border-color: #fed7aa;
}
.sti-ingen .sti-label { color: #9a3412; }
.sti-ingen .sti-tekst { color: #9a3412; }
.sti-ingen .sti-luk { color: #fb923c; }
.sti-ingen .sti-luk:hover { background: #ffedd5; }

:root[data-theme="dark"] .sti-panel { background: rgba(34,197,94,0.12); border-color: #22c55e; }
:root[data-theme="dark"] .sti-label,
:root[data-theme="dark"] .sti-tekst { color: #86efac; }
:root[data-theme="dark"] .sti-luk:hover { background: rgba(34,197,94,0.2); }
:root[data-theme="dark"] .sti-panel.sti-ingen { background: rgba(251,146,60,0.12); border-color: #fb923c; }
:root[data-theme="dark"] .sti-ingen .sti-label,
:root[data-theme="dark"] .sti-ingen .sti-tekst { color: #fdba74; }
:root[data-theme="dark"] .sti-ingen .sti-luk:hover { background: rgba(251,146,60,0.2); }

.sti-hint {
  margin-top: 8px; text-align: center;
  font-size: 0.82rem; color: var(--text-tertiary); font-style: italic;
}

.empty {
  padding: 40px 20px; text-align: center; color: var(--text-tertiary);
  background: var(--bg-layer-alt); border: 1px dashed var(--border-strong); border-radius: 8px;
}

.tree-container {
  position: relative;
  background: var(--bg-layer-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  height: calc(100vh - 260px);
  min-height: 400px;
  user-select: none;
}
.tree-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.zoom-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.zoom-btn {
  width: 32px; height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-layer);
  color: var(--text-primary);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-sm);
}
.zoom-btn:hover { background: var(--overlay-hover-strong); }

.kant-legend {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  background: var(--bg-card);
  opacity: 0.95;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  z-index: 10;
  pointer-events: none;
}
.legend-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.78rem; color: var(--text-secondary);
}


/* Noder ────────────────────────────────────── */
.node { cursor: pointer; transition: filter 0.15s; }
.node:hover { filter: brightness(1.06); }
.node-rect {
  fill: var(--bg-card);
  stroke: var(--border-strong);
  stroke-width: 1.2;
}
.node-navn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  fill: var(--text-primary);
  pointer-events: none;
}
.node-sub {
  font-family: inherit;
  font-size: 10.5px;
  fill: var(--text-secondary);
  pointer-events: none;
}
.node-alder {
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  fill: var(--tree-accent);
  pointer-events: none;
}
.node-dod .node-alder {
  fill: var(--text-tertiary) !important;
}

/* Roller ──────────────────────────────────── */
.node-kors {
  font-size: 11px;
  fill: var(--text-tertiary);
  pointer-events: none;
}

/* Afdød person — grå baggrund og dæmpet tekst */
.node-dod .node-rect {
  fill: var(--bg-layer-alt) !important;
  stroke: var(--border-strong) !important;
}
.node-dod .node-navn {
  fill: var(--text-secondary) !important;
}
.node-dod .node-sub {
  fill: var(--text-tertiary) !important;
}
/* Bevar selected-highlight selv om personen er død */
.role-selected.node-dod .node-rect {
  fill: #f5f5f0 !important;
  stroke: #b8a060 !important;
  stroke-width: 3 !important;
}
.role-selected .node-rect {
  stroke: #d4a017;
  stroke-width: 3;
  fill: #fffbe6;
}
.role-partner .node-rect {
  stroke: #db2777;
  stroke-width: 2;
  fill: #fdf2f8;
}
.role-sibling .node-rect {
  stroke: #f59e0b;
  stroke-width: 1.6;
  fill: #fffbeb;
}
.role-sibling-partner .node-rect {
  stroke: #db2777;
  stroke-width: 1.4;
  fill: #fdf2f8;
}
.role-partner-sibling .node-rect {
  stroke: #f97316;
  stroke-width: 1.6;
  fill: #fff7ed;
}
.role-partner-sibling-partner .node-rect {
  stroke: #db2777;
  stroke-width: 1.4;
  fill: #fdf2f8;
}
.role-cousin .node-rect {
  stroke: #0891b2;
  stroke-width: 1.6;
  fill: #ecfeff;
}
.role-cousin-partner .node-rect {
  stroke: #db2777;
  stroke-width: 1.4;
  fill: #fdf2f8;
}
.role-aunt-uncle .node-rect {
  stroke: #059669;
  stroke-width: 1.6;
  fill: #ecfdf5;
}
.role-aunt-uncle-partner .node-rect {
  stroke: #db2777;
  stroke-width: 1.4;
  fill: #fdf2f8;
}
.role-ancestor .node-rect {
  stroke: #6366f1;
  stroke-width: 1.4;
  fill: #eef2ff;
}
.role-descendant .node-rect {
  stroke: #10b981;
  stroke-width: 1.4;
  fill: #d1fae5;
}

/* Roller — mørkt tema: samme farvekoder, translucente fills over mørk baggrund */
:root[data-theme="dark"] .role-selected.node-dod .node-rect { fill: rgba(184,160,96,0.18); }
:root[data-theme="dark"] .role-selected .node-rect            { fill: rgba(212,160,23,0.18); }
:root[data-theme="dark"] .role-partner .node-rect,
:root[data-theme="dark"] .role-sibling-partner .node-rect,
:root[data-theme="dark"] .role-partner-sibling-partner .node-rect,
:root[data-theme="dark"] .role-cousin-partner .node-rect,
:root[data-theme="dark"] .role-aunt-uncle-partner .node-rect  { fill: rgba(219,39,119,0.18); }
:root[data-theme="dark"] .role-sibling .node-rect              { fill: rgba(245,158,11,0.18); }
:root[data-theme="dark"] .role-partner-sibling .node-rect      { fill: rgba(249,115,22,0.18); }
:root[data-theme="dark"] .role-cousin .node-rect               { fill: rgba(8,145,178,0.18); }
:root[data-theme="dark"] .role-aunt-uncle .node-rect           { fill: rgba(5,150,105,0.18); }
:root[data-theme="dark"] .role-ancestor .node-rect             { fill: rgba(99,102,241,0.18); }
:root[data-theme="dark"] .role-descendant .node-rect           { fill: rgba(16,185,129,0.22); }

/* Buttons ──────────────────────────────────── */
.btn {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: inherit; font-size: 0.9rem;
  cursor: pointer; transition: all 0.15s;
}
.btn-sm { padding: 3px 9px; font-size: 0.82rem; }
.btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-strong); }
.btn-ghost:hover { background: var(--overlay-hover-strong); }
</style>