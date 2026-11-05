<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Diskkartotek</h1>
      <button class="btn btn-subtle" :disabled="exporting" @click="exportDiscs">
        {{ exporting ? 'Eksporterer…' : '⬇️ Eksportér kartotek (JSON)' }}
      </button>
    </div>

    <p v-if="exportMessage" class="success-msg">{{ exportMessage }}</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading" class="empty-state">Indlæser…</p>

    <template v-else-if="discs.length > 0">
      <div class="search-bar">
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Søg efter navn, mærke, model eller noter…"
        />
      </div>

      <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Kategori</span>
        <div class="filter-chips">
          <button
            v-for="c in DISC_CATEGORIES"
            :key="c"
            class="filter-chip"
            :class="{ active: categoryFilter.includes(c) }"
            @click="toggle(categoryFilter, c)"
          >
            {{ c }}
          </button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">Egnet til</span>
        <div class="filter-chips">
          <button
            v-for="lvl in SKILL_LEVELS"
            :key="lvl"
            class="filter-chip"
            :class="{ active: levelFilter.includes(lvl) }"
            @click="toggle(levelFilter, lvl)"
          >
            {{ lvl }}
          </button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">Stabilitet</span>
        <div class="filter-chips">
          <button
            v-for="s in DISC_STABILITY"
            :key="s"
            class="filter-chip"
            :class="{ active: stabilityFilter.includes(s) }"
            @click="toggle(stabilityFilter, s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">I tasken</span>
        <div class="filter-chips">
          <button
            v-for="opt in BAG_OPTIONS"
            :key="opt"
            class="filter-chip"
            :class="{ active: bagFilter.includes(opt) }"
            @click="toggle(bagFilter, opt)"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">Ejer</span>
        <select v-model="ownerFilter" class="filter-select">
          <option :value="null">Alle ejere</option>
          <option :value="NO_OWNER">Ingen ejer</option>
          <option v-for="opt in FIXED_OWNERS" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>

      <button v-if="anyFilterActive" class="btn btn-ghost filter-reset" @click="resetFilters">
        Nulstil filtre
      </button>
      </div>
    </template>

    <div v-if="!loading" class="card">
      <div class="card-body">
        <p v-if="discs.length === 0" class="empty-hint">Ingen diske registreret endnu.</p>
        <p v-else-if="filteredDiscs.length === 0" class="empty-hint">
          Ingen diske matcher de valgte filtre.
        </p>
        <template v-else>
          <p class="filter-count">Viser {{ pageRangeLabel }} af {{ filteredDiscs.length }} diske</p>
          <div class="disc-grid">
          <div
            v-for="d in pagedDiscs"
            :key="d.id"
            class="disc-card"
            :class="{ expanded: expandedId === d.id, lost: d.lost }"
          >
            <div class="disc-card-image" @click="toggleExpand(d.id)">
              <img v-if="imageUrls[d.id]" :src="imageUrls[d.id]!" alt="" />
              <div v-else class="disc-placeholder">🥏</div>
              <span v-if="d.lost" class="lost-ribbon">Forsvundet</span>
            </div>

            <div class="disc-card-body">
              <h3 class="disc-name" @click="toggleExpand(d.id)">{{ d.name }}</h3>
              <p class="disc-meta">{{ [d.brand, d.mold].filter(Boolean).join(' · ') || d.category }}</p>
              <p class="disc-meta muted">{{ [d.category, d.stability].filter(Boolean).join(' · ') }}</p>

              <p class="disc-owner" :class="{ muted: !d.holder }">👤 {{ d.holder || 'Ingen ejer valgt' }}</p>
              <p class="disc-bag-status" :class="{ muted: !d.in_bag }">
                {{ d.in_bag ? '🎒 I tasken' : 'Ikke i tasken' }}
              </p>

              <div v-if="d.skill_levels.length" class="level-chips">
                <span v-for="lvl in d.skill_levels" :key="lvl" class="level-chip">{{ lvl }}</span>
              </div>

              <div class="disc-card-actions">
                <button class="btn btn-ghost" @click="toggleExpand(d.id)">
                  {{ expandedId === d.id ? 'Skjul detaljer' : 'Detaljer' }}
                </button>
                <button class="btn btn-ghost" @click="deleteDisc(d.id)">🗑</button>
              </div>
            </div>

            <div v-if="expandedId === d.id" class="disc-card-detail">
              <DiscDetailPanel :disc="d" :players="players" />
            </div>
          </div>
          </div>

          <div v-if="totalPages > 1" class="pagination">
            <button class="btn btn-ghost" :disabled="currentPage === 1" @click="currentPage--">← Forrige</button>
            <span class="pagination-status">Side {{ currentPage }} af {{ totalPages }}</span>
            <button class="btn btn-ghost" :disabled="currentPage === totalPages" @click="currentPage++">Næste →</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { downloadJson, invoke, errText } from '../invoke'
import { DISC_CATEGORIES, SKILL_LEVELS, DISC_STABILITY } from '../types'
import type { Disc } from '../types'
import DiscDetailPanel from '../components/DiscDetailPanel.vue'

const discs = ref<Disc[]>([])
const players = ref<string[]>([])
const imageUrls = ref<Record<number, string | null>>({})
const loading = ref(false)
const errorMsg = ref('')
const expandedId = ref<number | null>(null)
const exporting = ref(false)
const exportMessage = ref('')

const BAG_OPTIONS = ['I tasken', 'Ikke i tasken']
const NO_OWNER = '__ingen_ejer__'
const FIXED_OWNERS = ['Brochner', 'Miss Sunshine', 'William Otto']

const categoryFilter = ref<string[]>([])
const levelFilter = ref<string[]>([])
const stabilityFilter = ref<string[]>([])
const bagFilter = ref<string[]>([])
const ownerFilter = ref<string | null>(null)
const searchQuery = ref('')

const anyFilterActive = computed(
  () =>
    categoryFilter.value.length > 0 ||
    levelFilter.value.length > 0 ||
    stabilityFilter.value.length > 0 ||
    bagFilter.value.length > 0 ||
    ownerFilter.value !== null ||
    searchQuery.value.trim() !== ''
)

const filteredDiscs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return discs.value.filter(d => {
    if (categoryFilter.value.length > 0 && !categoryFilter.value.includes(d.category)) return false
    if (levelFilter.value.length > 0 && !d.skill_levels.some(lvl => levelFilter.value.includes(lvl))) return false
    if (stabilityFilter.value.length > 0 && (!d.stability || !stabilityFilter.value.includes(d.stability))) return false
    if (bagFilter.value.length === 1) {
      if (bagFilter.value[0] === 'I tasken' && !d.in_bag) return false
      if (bagFilter.value[0] === 'Ikke i tasken' && d.in_bag) return false
    }
    if (ownerFilter.value !== null && (d.holder ?? NO_OWNER) !== ownerFilter.value) return false
    if (query) {
      const haystack = [d.name, d.brand, d.mold, d.notes].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const PAGE_SIZE = 10
const currentPage = ref(1)

const totalPages = computed(() => Math.max(1, Math.ceil(filteredDiscs.value.length / PAGE_SIZE)))

const pagedDiscs = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredDiscs.value.slice(start, start + PAGE_SIZE)
})

const pageRangeLabel = computed(() => {
  if (filteredDiscs.value.length === 0) return '0'
  const start = (currentPage.value - 1) * PAGE_SIZE + 1
  const end = Math.min(currentPage.value * PAGE_SIZE, filteredDiscs.value.length)
  return start === end ? `${start}` : `${start}-${end}`
})

watch(filteredDiscs, () => {
  currentPage.value = 1
})

function toggle(arr: string[], value: string) {
  const idx = arr.indexOf(value)
  if (idx === -1) arr.push(value)
  else arr.splice(idx, 1)
}

function resetFilters() {
  categoryFilter.value = []
  levelFilter.value = []
  stabilityFilter.value = []
  bagFilter.value = []
  ownerFilter.value = null
  searchQuery.value = ''
}

async function loadDiscs() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [discList, playerList] = await Promise.all([
      invoke<Disc[]>('get_discs'),
      invoke<string[]>('get_players'),
    ])
    discs.value = discList
    players.value = playerList
    await Promise.all(
      discList.map(async d => {
        try {
          imageUrls.value[d.id] = await invoke<string | null>('get_disc_image_data_url', { discId: d.id })
        } catch {
          imageUrls.value[d.id] = null
        }
      })
    )
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(loadDiscs)

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

async function exportDiscs() {
  exportMessage.value = ''
  errorMsg.value = ''
  exporting.value = true
  try {
    downloadJson(`diskmate-kartotek-${new Date().toISOString().slice(0, 10)}.json`, await invoke('export_discs_json'))
    exportMessage.value = 'Kartoteket er hentet.'
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    exporting.value = false
  }
}

async function deleteDisc(id: number) {
  if (!confirm('Slet denne disc? Eventuelle hul-tildelinger til den forsvinder også.')) return
  try {
    await invoke('delete_disc', { discId: id })
    if (expandedId.value === id) expandedId.value = null
    await loadDiscs()
  } catch (e) {
    errorMsg.value = errText(e)
  }
}
</script>

<style scoped>
.empty-hint { color: var(--text-tertiary); }

.search-bar {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 9px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--bg-layer);
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
  background: var(--bg-layer);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
  margin-bottom: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-select {
  padding: 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12px;
  background: var(--bg-layer-alt);
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-tertiary);
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--bg-layer-alt);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.filter-chip:hover {
  background: var(--bg-layer);
}

.filter-chip.active {
  background: var(--accent);
  border-color: var(--accent-dark);
  color: var(--text-on-accent);
  font-weight: 600;
}

.filter-reset {
  align-self: flex-end;
  margin-left: auto;
}

.filter-count {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0 0 12px;
}

.success-msg {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
}

.disc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.disc-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-layer);
  overflow: hidden;
  grid-column: span 1;
  transition: box-shadow 0.15s;
}

.disc-card.expanded {
  grid-column: 1 / -1;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.disc-card.lost {
  border-color: var(--error, #c0392b);
}

.disc-card-image {
  position: relative;
  width: 100%;
  height: 320px;
  background: var(--bg-layer-alt);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.disc-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.disc-placeholder {
  font-size: 80px;
  opacity: 0.4;
}

.lost-ribbon {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--error, #c0392b);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}

.disc-card-body {
  padding: 12px 14px;
}

.disc-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  cursor: pointer;
}

.disc-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.disc-meta.muted {
  color: var(--text-tertiary);
}

.disc-owner {
  font-size: 12px;
  margin: 8px 0 0;
}

.disc-bag-status {
  font-size: 12px;
  margin: 2px 0 0;
}

.disc-owner.muted,
.disc-bag-status.muted {
  color: var(--text-tertiary);
}

.level-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.level-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-subtle);
  border: 1px solid var(--accent);
  color: var(--text-primary);
}

.disc-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.disc-card-detail {
  border-top: 1px solid var(--border);
  padding: 12px 16px 16px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}

.pagination-status {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
