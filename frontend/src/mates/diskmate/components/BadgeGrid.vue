<template>
  <div class="card badge-card">
    <div class="card-body">
      <h2 class="section-title">🏅 Badges</h2>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p v-if="loading" class="empty-state">Indlæser…</p>

      <template v-else-if="board">
        <div v-if="board.personal_best" class="pb-banner">
          <span class="pb-icon">👑</span>
          <div>
            <div class="pb-title">Personlig rekord</div>
            <div class="pb-detail">
              {{ fmt(board.personal_best.to_par) }} på {{ board.personal_best.course_name }} —
              {{ board.personal_best.layout_name }} ({{ board.personal_best.date.slice(0, 10) }})
            </div>
          </div>
        </div>

        <div v-for="cat in categories" :key="cat" class="badge-category">
          <h3 class="category-title">{{ cat }}</h3>
          <div class="badge-grid">
            <div
              v-for="b in badgesByCategory[cat]"
              :key="b.id"
              class="badge-tile"
              :class="{ achieved: b.achieved }"
              :title="b.description"
            >
              <span class="badge-icon">{{ b.icon }}</span>
              <span class="badge-label">{{ b.label }}</span>
              <span v-if="b.achieved" class="badge-check">✓</span>
              <span v-else class="badge-progress">{{ fmtProgress(b) }} / {{ fmtProgress2(b) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { Badge, BadgeBoard } from '../types'

const props = defineProps<{ playerName: string }>()

const board = ref<BadgeBoard | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const categories = computed(() => {
  if (!board.value) return []
  const seen: string[] = []
  for (const b of board.value.badges) {
    if (!seen.includes(b.category)) seen.push(b.category)
  }
  return seen
})

const badgesByCategory = computed(() => {
  const map: Record<string, Badge[]> = {}
  if (!board.value) return map
  for (const b of board.value.badges) {
    if (!map[b.category]) map[b.category] = []
    map[b.category].push(b)
  }
  return map
})

async function load() {
  if (!props.playerName) return
  loading.value = true
  errorMsg.value = ''
  try {
    board.value = await invoke<BadgeBoard>('get_player_badges', { playerName: props.playerName })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.playerName, load)

function fmt(n: number) {
  return n > 0 ? `+${n}` : n.toString()
}

function fmtProgress(b: { progress: number }) {
  return b.progress.toLocaleString('da-DK')
}

function fmtProgress2(b: { target: number }) {
  return b.target.toLocaleString('da-DK')
}
</script>

<style scoped>
.badge-card { margin-bottom: 16px; }

.pb-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--accent-subtle);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 20px;
}

.pb-icon { font-size: 24px; }
.pb-title { font-weight: 600; font-size: 13px; color: var(--accent-dark); }
.pb-detail { font-size: 12px; color: var(--text-secondary); }

.badge-category { margin-bottom: 16px; }

.category-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-layer-alt);
  opacity: 0.5;
  text-align: center;
}

.badge-tile.achieved {
  opacity: 1;
  background: var(--accent-subtle);
  border-color: var(--accent);
}

.badge-icon { font-size: 22px; }
.badge-label { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.badge-check { font-size: 12px; color: var(--success); font-weight: 700; }
.badge-progress { font-size: 10px; color: var(--text-tertiary); }
</style>
