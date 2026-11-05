import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'econmate' }

export const econmateRoutes: RouteRecordRaw[] = [
  { path: '/econmate', component: () => import('./views/EconmateHome.vue'), meta },
  { path: '/econmate/:eventId(\\d+)', component: () => import('./views/EventDetail.vue'), meta },
]
