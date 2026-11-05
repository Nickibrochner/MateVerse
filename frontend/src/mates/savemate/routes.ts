import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'savemate' }

export const savemateRoutes: RouteRecordRaw[] = [
  { path: '/savemate', component: () => import('./views/SavemateHome.vue'), meta },
  { path: '/savemate/:goalId(\\d+)', component: () => import('./views/GoalDetail.vue'), meta },
]
