<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Grupperunder</h1>
    </div>

    <p class="hint">
      Runder hvor 2 eller flere spillere har spillet samme layout samme dag, samlet som en udflugt
      med sin egen leaderboard.
    </p>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading" class="empty-state">Indlæser…</p>

    <div v-if="!loading && sessions.length === 0" class="empty-state">
      <p>Ingen grupperunder endnu — det kræver mindst 2 spillere på samme layout samme dag.</p>
    </div>

    <div v-for="s in sessions" :key="`${s.layout_id}-${s.date}`" class="card session-card">
      <div class="card-body">
        <div class="session-header" @click="toggleExpand(s)">
          <div>
            <strong>{{ s.course_name }}</strong> — {{ s.layout_name }}
            <div class="session-date">{{ s.date }}</div>
          </div>
          <div class="session-meta">
            <span class="badge layout-badge">{{ s.player_count }} spillere</span>
            <button class="btn btn-ghost">
              {{ isExpanded(s) ? 'Skjul' : 'Se leaderboard' }}
            </button>
          </div>
        </div>

        <template v-if="isExpanded(s)">
          <p v-if="loadingDetail" class="empty-state">Indlæser…</p>
          <table v-else-if="detail" class="fluent-table">
            <thead>
              <tr>
                <th>Plads</th>
                <th>Spiller</th>
                <th>Score</th>
                <th>+/-</th>
                <th>UDisc rating</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in detail.results" :key="r.player_name">
                <td>{{ medal(r.placement) }} {{ r.placement }}.</td>
                <td>{{ r.player_name }}</td>
                <td>{{ r.total_score }}</td>
                <td :class="toParClass(r.to_par)">{{ fmt(r.to_par) }}</td>
                <td>{{ r.rating ?? '–' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke, errText } from '../invoke'
import type { Session, SessionDetail } from '../types'

const sessions = ref<Session[]>([])
const loading = ref(false)
const errorMsg = ref('')

const expandedKey = ref<string | null>(null)
const detail = ref<SessionDetail | null>(null)
const loadingDetail = ref(false)

function keyOf(s: Session) {
  return `${s.layout_id}-${s.date}`
}

function isExpanded(s: Session) {
  return expandedKey.value === keyOf(s)
}

async function toggleExpand(s: Session) {
  if (isExpanded(s)) {
    expandedKey.value = null
    return
  }
  expandedKey.value = keyOf(s)
  loadingDetail.value = true
  try {
    detail.value = await invoke<SessionDetail>('get_session_detail', {
      layoutId: s.layout_id,
      date: s.date,
    })
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loadingDetail.value = false
  }
}

async function loadSessions() {
  loading.value = true
  errorMsg.value = ''
  try {
    sessions.value = await invoke<Session[]>('get_sessions')
  } catch (e) {
    errorMsg.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(loadSessions)

function medal(placement: number) {
  if (placement === 1) return '🥇'
  if (placement === 2) return '🥈'
  if (placement === 3) return '🥉'
  return ''
}

function fmt(n: number) {
  return n > 0 ? `+${n.toFixed(0)}` : n.toFixed(0)
}

function toParClass(n: number) {
  if (n < 0) return 'gain'
  if (n > 0) return 'loss'
  return ''
}
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  max-width: 640px;
}

.session-card { margin-bottom: 12px; }

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  gap: 12px;
}

.session-date {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.layout-badge {
  background: var(--accent-subtle);
  color: var(--accent-dark);
}

.fluent-table { margin-top: 16px; }
</style>
