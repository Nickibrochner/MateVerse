import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'kanmate' }

export const kanmateRoutes: RouteRecordRaw[] = [
  { path: '/kanmate', component: () => import('./views/Projects.vue'), meta },
  { path: '/kanmate/board', component: () => import('./views/Board.vue'), meta },
  { path: '/kanmate/projekt/:projectId(\\d+)', component: () => import('./views/Board.vue'), meta },
  { path: '/kanmate/deadlines', component: () => import('./views/Deadlines.vue'), meta },
  { path: '/kanmate/arkiv', component: () => import('./views/Archive.vue'), meta },
  { path: '/kanmate/papirkurv', component: () => import('./views/Trash.vue'), meta },
]
